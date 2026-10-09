import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { findService, toISO, type Audience, type Service } from "./salon";
import { type Booking, type Customer } from "./booking-store";
import { adminCheckPin, adminListBookings, adminUpsertBooking, adminChangePin,
  adminSaveConfig, type BookingRow } from "./salon.functions";

/* ── Types ───────────────────────────────────────────────────── */

export type ApptStatus =
  | "upcoming"
  | "arrived"
  | "in-chair"
  | "completed"
  | "no-show"
  | "cancelled";

export type PaymentMethod = "cash" | "upi" | "card" | "unpaid";

export type ApptMeta = {
  status: ApptStatus;
  staffId: string | null;
  payment: PaymentMethod;
  amount: number | null;
  note: string;
};

export type WalkIn = {
  reference: string;
  audience: Audience;
  serviceIds: string[];
  date: string;
  time: number;
  customer: Customer;
  createdAt: string;
};

export type Staff = {
  id: string;
  name: string;
  role: string;
  active: boolean;
};

export type AdminSettings = {
  pin: string;
  salonName: string;
  acceptingBookings: boolean;
};

export type Appointment = {
  reference: string;
  audience: Audience;
  serviceIds: string[];
  date: string;
  time: number;
  customer: Customer;
  createdAt: string;
  source: "online" | "walk-in";
  meta: ApptMeta;
  services: Service[];
  total: number;
  slots: number;
};

/* ── Persistence ─────────────────────────────────────────────── */

const META_KEY = "hbb.admin.meta.v1";
const WALKIN_KEY = "hbb.admin.walkins.v1";
const STAFF_KEY = "hbb.admin.staff.v1";
const SETTINGS_KEY = "hbb.admin.settings.v1";
const SESSION_KEY = "hbb.admin.session.v1";

const DEFAULT_STAFF: Staff[] = [
  { id: "st-bhargav", name: "Bhargav", role: "Founder · Master Stylist", active: true },
  { id: "st-chair2", name: "Chair 2", role: "Stylist", active: true },
  { id: "st-beauty", name: "Beauty Room", role: "Beauty & Skin", active: true },
];

const DEFAULT_SETTINGS: AdminSettings = {
  pin: "1143",
  salonName: "Hair by Bhargav",
  acceptingBookings: true,
};

const DEFAULT_META: ApptMeta = {
  status: "upcoming",
  staffId: null,
  payment: "unpaid",
  amount: null,
  note: "",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function makeRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return "WI-" + out;
}

/* ── Context ─────────────────────────────────────────────────── */

type Ctx = {
  hydrated: boolean;
  authed: boolean;
  pin: string;
  signIn: (pin: string) => Promise<boolean>;
  refresh: () => void;
  signOut: () => void;

  appointments: Appointment[];
  byDate: (iso: string) => Appointment[];
  setStatus: (reference: string, status: ApptStatus) => void;
  setStaff: (reference: string, staffId: string | null) => void;
  setPayment: (reference: string, payment: PaymentMethod, amount: number | null) => void;
  setNote: (reference: string, note: string) => void;
  reschedule: (reference: string, date: string, time: number) => void;

  addWalkIn: (input: Omit<WalkIn, "reference" | "createdAt">) => Appointment | null;

  staff: Staff[];
  addStaff: (name: string, role: string) => void;
  toggleStaff: (id: string) => void;
  removeStaff: (id: string) => void;

  settings: AdminSettings;
  updateSettings: (patch: Partial<AdminSettings>) => void;
};

const AdminContext = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [pinCode, setPinCode] = useState("");

  const [hydrated, setHydrated] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [metas, setMetas] = useState<Record<string, ApptMeta>>({});
  const [walkIns, setWalkIns] = useState<WalkIn[]>([]);
  const [staff, setStaff] = useState<Staff[]>(DEFAULT_STAFF);
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setMetas(read<Record<string, ApptMeta>>(META_KEY, {}));
    setWalkIns(read<WalkIn[]>(WALKIN_KEY, []));
    setStaff(read<Staff[]>(STAFF_KEY, DEFAULT_STAFF));
    setSettings({ ...DEFAULT_SETTINGS, ...read<Partial<AdminSettings>>(SETTINGS_KEY, {}) });
    const saved = window.sessionStorage.getItem(SESSION_KEY) ?? "";
    if (saved.length >= 4) {
      setPinCode(saved);
      setAuthed(true);
    }
    setHydrated(true);
  }, []);

  const load = (pin: string) =>
    adminListBookings({ data: { pin } })
      .then((r) => setRows(r.bookings))
      .catch(() => {
        setAuthed(false);
        window.sessionStorage.removeItem(SESSION_KEY);
      });

  useEffect(() => {
    if (!authed || !pinCode) return;
    void load(pinCode);
    const t = window.setInterval(() => void load(pinCode), 30000);
    return () => window.clearInterval(t);
  }, [authed, pinCode]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(META_KEY, JSON.stringify(metas));
  }, [metas, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(WALKIN_KEY, JSON.stringify(walkIns));
  }, [walkIns, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
  }, [staff, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  const value = useMemo<Ctx>(() => {
    const build = (
      b: Pick<Booking, "reference" | "audience" | "serviceIds" | "date" | "time" | "customer" | "createdAt">,
      source: "online" | "walk-in",
      cancelled: boolean,
    ): Appointment => {
      const services = b.serviceIds
        .map((id) => findService(b.audience, id))
        .filter((x): x is Service => Boolean(x));
      const stored = metas[b.reference];
      const meta: ApptMeta = cancelled
        ? { ...DEFAULT_META, ...stored, status: "cancelled" }
        : { ...DEFAULT_META, ...stored };
      return {
        ...b,
        source,
        meta,
        services,
        total: services.reduce((n, s) => n + s.price, 0),
        slots: services.reduce((n, s) => n + s.slots, 0) || 1,
      };
    };

    const appointments: Appointment[] = [
      ...rows.map((r) => {
        const a = build(r, r.source, r.status === "cancelled");
        const m = r.meta as Partial<ApptMeta>;
        a.meta = r.status === "cancelled" ? { ...DEFAULT_META, ...m, status: "cancelled" } : { ...DEFAULT_META, ...m };
        return a;
      }),
      ...walkIns.filter((w) => !rows.some((r) => r.reference === w.reference)).map((w) => build(w, "walk-in", false)),
    ].sort((a, z) => (a.date === z.date ? a.time - z.time : a.date < z.date ? -1 : 1));

    const patchMeta = (reference: string, patch: Partial<ApptMeta>) => {
      const row = rows.find((r) => r.reference === reference);
      const next = { ...DEFAULT_META, ...metas[reference], ...(row?.meta as Partial<ApptMeta>), ...patch };
      setMetas((m) => ({ ...m, [reference]: next }));
      setRows((rs) => rs.map((r) => (r.reference === reference ? { ...r, meta: next, status: patch.status === "cancelled" ? "cancelled" : patch.status ? "confirmed" : r.status } : r)));
      void adminUpsertBooking({
        data: {
          pin: pinCode,
          reference,
          patch: { meta: next, ...(patch.status ? { status: patch.status === "cancelled" ? "cancelled" : "confirmed" } : {}) },
        },
      }).catch(() => {});
    };

    return {
      hydrated,
      authed,
      signIn: async (pin) => {
        const p = pin.trim();
        const { ok } = await adminCheckPin({ data: { pin: p } }).catch(() => ({ ok: false }));
        if (ok) {
          setPinCode(p);
          setAuthed(true);
          window.sessionStorage.setItem(SESSION_KEY, p);
        }
        return ok;
      },
      refresh: () => void load(pinCode),
      signOut: () => {
        setAuthed(false);
        window.sessionStorage.removeItem(SESSION_KEY);
      },

      appointments,
      byDate: (iso) => appointments.filter((a) => a.date === iso),
      setStatus: (reference, status) => patchMeta(reference, { status }),
      setStaff: (reference, staffId) => patchMeta(reference, { staffId }),
      setPayment: (reference, payment, amount) => patchMeta(reference, { payment, amount }),
      setNote: (reference, note) => patchMeta(reference, { note }),
      reschedule: (reference, date, time) => {
        setRows((rs) => rs.map((r) => (r.reference === reference ? { ...r, date, time } : r)));
        void adminUpsertBooking({ data: { pin: pinCode, reference, patch: { date, time } } }).catch(() => {});
      },

      addWalkIn: (input) => {
        const entry: WalkIn = {
          ...input,
          reference: makeRef(),
          createdAt: new Date().toISOString(),
        };
        const appt = build(entry, "walk-in", false);
        setRows((rs) => [
          { ...entry, slots: appt.slots, status: "confirmed", source: "walk-in", meta: {} },
          ...rs,
        ]);
        void adminUpsertBooking({
          data: {
            pin: pinCode,
            reference: entry.reference,
            insert: {
              audience: entry.audience,
              serviceIds: entry.serviceIds,
              date: entry.date,
              time: entry.time,
              slots: appt.slots,
              customer: { ...entry.customer, email: entry.customer.email ?? "" },
              source: "walk-in",
            },
          },
        }).catch(() => {});
        return appt;
      },

      staff,
      addStaff: (name, role) =>
        setStaff((s) => [
          ...s,
          { id: "st-" + Math.random().toString(36).slice(2, 8), name, role, active: true },
        ]),
      toggleStaff: (id) =>
        setStaff((s) => s.map((x) => (x.id === id ? { ...x, active: !x.active } : x))),
      removeStaff: (id) => setStaff((s) => s.filter((x) => x.id !== id)),

      pin: pinCode,
      settings,
      updateSettings: (patch) => {
        if (patch.pin && /^\d{4,8}$/.test(patch.pin)) {
          const next = patch.pin;
          void adminChangePin({ data: { pin: pinCode, next } }).then(() => {
            setPinCode(next);
            window.sessionStorage.setItem(SESSION_KEY, next);
          });
        }
        if (patch.acceptingBookings !== undefined) {
          void adminSaveConfig({ data: { pin: pinCode, config: { accepting: patch.acceptingBookings } } });
        }
        setSettings((s) => ({ ...s, ...patch }));
      },
    };
  }, [rows, walkIns, metas, staff, settings, hydrated, authed, pinCode]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}

/* ── Derived helpers ─────────────────────────────────────────── */

export const todayISO = () => toISO(new Date());

export const STATUS_LABEL: Record<ApptStatus, string> = {
  upcoming: "Upcoming",
  arrived: "Arrived",
  "in-chair": "In chair",
  completed: "Completed",
  "no-show": "No show",
  cancelled: "Cancelled",
};

export const isLive = (s: ApptStatus) => s === "upcoming" || s === "arrived" || s === "in-chair";

export type CustomerRecord = {
  key: string;
  name: string;
  phone: string;
  email: string;
  visits: number;
  spend: number;
  lastVisit: string | null;
  appointments: Appointment[];
};

export function customersFrom(appointments: Appointment[]): CustomerRecord[] {
  const map = new Map<string, CustomerRecord>();
  for (const a of appointments) {
    const key = a.customer.phone.replace(/\D/g, "").slice(-10) || a.customer.name.toLowerCase();
    const rec =
      map.get(key) ??
      ({
        key,
        name: a.customer.name,
        phone: a.customer.phone,
        email: a.customer.email,
        visits: 0,
        spend: 0,
        lastVisit: null,
        appointments: [],
      } satisfies CustomerRecord);
    rec.appointments.push(a);
    if (a.meta.status === "completed") {
      rec.visits += 1;
      rec.spend += a.meta.amount ?? a.total;
      if (!rec.lastVisit || a.date > rec.lastVisit) rec.lastVisit = a.date;
    }
    map.set(key, rec);
  }
  return [...map.values()].sort((a, z) => z.spend - a.spend || z.visits - a.visits);
}
