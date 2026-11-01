// Stylists, their services/hours/breaks/leave/blocks, and salon closures,
// stored as one JSON record in `site_settings` (key "staff_store"), so the
// Staff and Closures screens work without any database update.
//
// `stable(name)` returns a tiny query object with the same shape the code
// already used for database tables (select/eq/is/lte/gte/in/order/limit,
// insert/update/delete, maybeSingle/single), so callers barely change.
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";

type Row = Record<string, unknown>;
export type StaffTable =
  | "staff"
  | "staff_services"
  | "staff_working_hours"
  | "staff_breaks"
  | "staff_leave"
  | "staff_unavailability"
  | "salon_closures";
type Store = Record<StaffTable, Row[]>;

const KEY = "staff_store";
const TABLES: StaffTable[] = [
  "staff",
  "staff_services",
  "staff_working_hours",
  "staff_breaks",
  "staff_leave",
  "staff_unavailability",
  "salon_closures",
];
const empty = (): Store => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Store;
const uuid = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();

/** Column defaults the old tables had. */
const DEFAULTS: Partial<Record<StaffTable, () => Row>> = {
  staff: () => ({ gender: "", specialties: "", active: true, bookable: true, display_order: 0, archived_at: null }),
  staff_leave: () => ({ reason: "", archived_at: null }),
  staff_unavailability: () => ({ reason: "", archived_at: null }),
  salon_closures: () => ({ end_date: null, start_minute: null, end_minute: null, reason: "", reopened_at: null }),
  staff_breaks: () => ({ day_of_week: null, label: "Break" }),
};

/** The team the salon started with (same as the original seed): Bhargav + two stylists. */
async function seed(): Promise<Store> {
  const s = empty();
  const [{ data: svcs }, { data: hours }] = await Promise.all([
    sb.from("services").select("id, name, gender"),
    sb.from("opening_hours").select("*"),
  ]);
  const toMin = (t: unknown) => {
    const [h, m] = String(t ?? "10:00").split(":").map(Number);
    return (h ?? 10) * 60 + (m ?? 0);
  };
  const team = [
    { name: "Bhargav", gender: "male", specialties: "Founder · Chief Stylist", display_order: 0 },
    { name: "Male Stylist", gender: "male", specialties: "Men's hair & grooming", display_order: 1 },
    { name: "Female Stylist", gender: "female", specialties: "Women's hair & beauty", display_order: 2 },
  ].map((t) => ({ ...DEFAULTS.staff!(), ...t, id: uuid(), created_at: now() }));
  const [b, m, f] = team as unknown as [Row, Row, Row];
  s.staff = team;
  const sig = (n: string) => /^bhargav.?s signature/i.test(n);
  for (const x of (svcs ?? []) as { id: string; name: string; gender: string }[]) {
    if (x.gender === "men" || sig(x.name)) s.staff_services.push({ staff_id: b["id"], service_id: x.id });
    if (x.gender === "men" && !sig(x.name)) s.staff_services.push({ staff_id: m["id"], service_id: x.id });
    if (x.gender === "women" && !sig(x.name)) s.staff_services.push({ staff_id: f["id"], service_id: x.id });
  }
  const week = (hours ?? []) as Row[];
  for (const st of team) {
    for (let d = 0; d < 7; d++) {
      const h = week.find((r) => r["day_of_week"] === d);
      const start = h ? toMin(h["opening_time"]) : 600;
      const end = h ? Math.max(toMin(h["closing_time"]), start + 30) : 1200;
      s.staff_working_hours.push({ staff_id: st["id"], day_of_week: d, is_working: h ? Boolean(h["is_open"]) : d !== 2, start_minute: start, end_minute: end });
    }
    s.staff_breaks.push({ id: uuid(), staff_id: st["id"], day_of_week: null, start_minute: 780, end_minute: 840, label: "Lunch" });
  }
  return s;
}

/** A store from an already-read settings value (null if it isn't one). */
export function storeFromValue(v: unknown): Store | null {
  const s = v as Partial<Store> | undefined;
  return s && Array.isArray(s.staff) ? ({ ...empty(), ...s } as Store) : null;
}

let tables: { value: boolean; at: number } | null = null;
/** True when the staff tables exist (database update 0008 applied): then they are used directly. */
export async function staffTablesExist(): Promise<boolean> {
  if (tables && (tables.value || Date.now() - tables.at < 5 * 60_000)) return tables.value;
  const { error } = await sb.from("staff" as never).select("id").limit(1);
  tables = { value: !error, at: Date.now() };
  return !error;
}

/** Reads the whole store (seeding the team the first time). */
export async function loadStore(): Promise<Store> {
  if (await staffTablesExist()) {
    const res = await Promise.all(TABLES.map((n) => sb.from(n as never).select("*")));
    return Object.fromEntries(TABLES.map((n, i) => [n, (res[i]!.data ?? []) as Row[]])) as unknown as Store;
  }
  const { data } = await sb.from("site_settings").select("value").eq("key", KEY).maybeSingle();
  const v = data?.value as Partial<Store> | undefined;
  if (v && Array.isArray(v.staff)) return { ...empty(), ...v } as Store;
  const fresh = await seed();
  await saveStore(fresh);
  return fresh;
}
async function saveStore(s: Store) {
  const { error } = await sb.from("site_settings").upsert({ key: KEY, value: s as never });
  return error;
}

type Filter = (r: Row) => boolean;
type Result = { data: unknown; error: { message: string } | null };

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  /** every builder call, replayed on the real table when it exists */
  private calls: [string, unknown[]][] = [];
  private sortBy: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private one: "maybe" | "single" | null = null;
  private returning = false;
  constructor(
    private table: StaffTable,
    private op: "select" | "insert" | "update" | "delete",
    private payload?: Row | Row[],
    private store?: Store,
  ) {}
  select(_cols?: string) {
    this.calls.push(["select", [...arguments]]);
    if (this.op !== "select") this.returning = true;
    return this;
  }
  eq(c: string, v: unknown) {
    this.calls.push(["eq", [...arguments]]);
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.calls.push(["neq", [...arguments]]);
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  is(c: string, v: null) {
    this.calls.push(["is", [...arguments]]);
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  lte(c: string, v: string | number) {
    this.calls.push(["lte", [...arguments]]);
    this.filters.push((r) => r[c] != null && (r[c] as string | number) <= v);
    return this;
  }
  gte(c: string, v: string | number) {
    this.calls.push(["gte", [...arguments]]);
    this.filters.push((r) => r[c] != null && (r[c] as string | number) >= v);
    return this;
  }
  lt(c: string, v: string | number) {
    this.calls.push(["lt", [...arguments]]);
    this.filters.push((r) => r[c] != null && (r[c] as string | number) < v);
    return this;
  }
  gt(c: string, v: string | number) {
    this.calls.push(["gt", [...arguments]]);
    this.filters.push((r) => r[c] != null && (r[c] as string | number) > v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.calls.push(["in", [...arguments]]);
    const set = new Set(vs);
    this.filters.push((r) => set.has(r[c]));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.calls.push(["order", [...arguments]]);
    this.sortBy.push({ col, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.calls.push(["limit", [...arguments]]);
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.calls.push(["maybeSingle", [...arguments]]);
    this.one = "maybe";
    return this;
  }
  single() {
    this.calls.push(["single", [...arguments]]);
    this.one = "single";
    return this;
  }

  private async run(): Promise<Result> {
    if (await staffTablesExist()) {
      // database update applied: same query against the real table
      let q = sb.from(this.table as never) as unknown as Record<string, (...a: unknown[]) => unknown>;
      q = (this.op === "select" ? q["select"]!("*") : this.op === "delete" ? q["delete"]!() : q[this.op]!(this.payload)) as typeof q;
      for (const [name, args] of this.calls) {
        if (name === "select" && this.op === "select") continue;
        q = q[name]!(...args) as typeof q;
      }
      const r = (await (q as unknown as PromiseLike<Result>)) as Result;
      return { data: r.data, error: r.error ? { message: r.error.message } : null };
    }
    const store = this.store ?? (await loadStore());
    const rows = store[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === "select") {
      out = rows.filter(match);
    } else if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]).map((r) => ({
        ...(DEFAULTS[this.table]?.() ?? {}),
        id: uuid(),
        created_at: now(),
        ...r,
      }));
      rows.push(...list);
      out = list;
    } else if (this.op === "update") {
      for (const r of rows) if (match(r)) Object.assign(r, this.payload, { updated_at: now() });
      out = rows.filter(match);
    } else {
      out = rows.filter(match);
      store[this.table] = rows.filter((r) => !match(r));
    }
    if (this.op !== "select") {
      const err = await saveStore(store);
      if (err) return { data: null, error: { message: err.message } };
    }
    for (const { col, asc } of [...this.sortBy].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[col] as string | number | null;
        const y = b[col] as string | number | null;
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.max != null) out = out.slice(0, this.max);
    if (this.one) {
      if (this.one === "single" && out.length !== 1) return { data: null, error: { message: "Expected one row" } };
      return { data: out[0] ?? null, error: null };
    }
    if (this.op !== "select" && !this.returning) return { data: null, error: null };
    return { data: structuredClone(out), error: null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }
}

/** A table-like view of one part of the store. Pass `store` to share one read across queries. */
export function stable(table: StaffTable, store?: Store) {
  return {
    select: (_cols?: string) => new Query(table, "select", undefined, store),
    insert: (rows: Row | Row[]) => new Query(table, "insert", rows),
    update: (patch: Row) => new Query(table, "update", patch),
    delete: () => new Query(table, "delete"),
  };
}

export { staffIdOf, staffChoiceOf, metaWithStaff } from "./booking-staff";

let perStylistGuard: { value: boolean; at: number } | null = null;
/**
 * True once the database's double-booking guard works per stylist (the
 * bookings table has staff_id). Before that the database allows only one
 * appointment at a time across the salon, and availability respects that.
 */
export async function hasPerStylistGuard(): Promise<boolean> {
  if (perStylistGuard && (perStylistGuard.value || Date.now() - perStylistGuard.at < 5 * 60_000))
    return perStylistGuard.value;
  const { error } = await sb.from("bookings").select("staff_id" as never).limit(1);
  perStylistGuard = { value: !error, at: Date.now() };
  return !error;
}
