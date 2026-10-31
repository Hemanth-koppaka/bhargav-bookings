import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { findService, toISO, type Audience, type Service } from "./salon";
import { type Booking, type Customer } from "./booking-store";
import { toast } from "sonner";
import { adminSignIn, adminListBookings, adminUpsertBooking, adminChangePin,
  adminSaveConfig, type BookingRow } from "./salon.functions";

/* ── Types ───────────────────────────────────────────────────── */

export type ApptStatus =
  | "pending"
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
  salonName: string;
  acceptingBookings: boolean;
};

export type SignInOutcome = { ok: true } | { ok: false; message: string };

export type Appointment = {
  reference: string;
  audience: Audience;
  serviceIds: string[];
  date: string;
  time: number;
  customer: Customer;
  createdAt: string;
  source: "online" | "walk-in" | "phone" | "whatsapp" | "admin";
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
  /** Session token sent with every admin call (the server field is still called `pin`). */
  pin: string;
  /** True while the console is still protected by a short or default code. */
  weakCode: boolean;
  signIn: (code: string) => Promise<SignInOutcome>;
  changeCode: (current: string, next: string) => Promise<SignInOutcome>;
  refresh: () => void;
  signOut: (reason?: string) => void;
  signOutReason: string;

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

type StoredSession = { token: string; expiresAt: number; weak: boolean };

function readSession(): StoredSession | null {
  try {
    const s = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null;
    return s && s.token && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

const fmtWait = (sec: number) => (sec >= 90 ? `${Math.ceil(sec / 60)} minutes` : `${sec} seconds`);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [pinCode, setPinCode] = useState("");
  const [weakCode, setWeakCode] = useState(false);
  const [signOutReason, setSignOutReason] = useState("");

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
    const session = readSession();
    if (session) {
      setPinCode(session.token);
      setWeakCode(session.weak);
      setAuthed(true);
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
    setHydrated(true);
  }, []);

  const endSession = (reason = "") => {
    setAuthed(false);
    setPinCode("");
    setRows([]);
    setSignOutReason(reason);
    window.sessionStorage.removeItem(SESSION_KEY);
  };

  const load = (token: string) =>
    adminListBookings({ data: { pin: token } })
      .then((r) => {
        setRows(r.bookings);
        if (r.staffJson) setStaff(JSON.parse(r.staffJson) as Staff[]);
        setSettings((s) => ({ ...s, acceptingBookings: r.accepting }));
      })
      .catch(() => endSession("Your session ended. Please sign in again."));

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

  /** Saves the team list for every device; rolls back with a message on failure. */
  const saveStaff = (next: Staff[]) => {
    const prev = staff;
    setStaff(next);
    adminSaveConfig({ data: { pin: pinCode, config: { staff: next } } }).catch(() => {
      setStaff(prev);
      toast.error("Couldn't save the team list. Check your connection and try again.");
    });
  };

  /** Runs a server write; on failure tells the operator and reloads the true state. */
  const guard = (p: Promise<unknown>, message: string) =>
    p.catch((e: unknown) => {
      const text = e instanceof Error ? e.message : "";
      if (/session/i.test(text)) return endSession("Your session ended. Please sign in again.");
      toast.error(message);
      void load(pinCode);
    });
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  const value = useMemo<Ctx>(() => {
    const build = (
      b: Pick<Booking, "reference" | "audience" | "serviceIds" | "date" | "time" | "customer" | "createdAt">,
      source: Appointment["source"],
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
      void guard(
        adminUpsertBooking({
          data: {
            pin: pinCode,
            reference,
            patch: { meta: next, ...(patch.status ? { status: patch.status === "cancelled" ? "cancelled" : "confirmed" } : {}) },
          },
        }),
        "Couldn't save that change. The appointment has been reloaded.",
      );
    };

    const startSession = (s: StoredSession) => {
      setPinCode(s.token);
      setWeakCode(s.weak);
      setAuthed(true);
      setSignOutReason("");
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    };

    return {
      hydrated,
      authed,
      weakCode,
      signOutReason,
      signIn: async (code) => {
        const r = await adminSignIn({ data: { code: code.trim() } }).catch(() => null);
        if (!r) return { ok: false, message: "Couldn't reach the server. Check your connection." };
        if (r.ok) {
          startSession({ token: r.token, expiresAt: r.expiresAt, weak: r.weak });
          return { ok: true };
        }
        if (r.lockedFor) return { ok: false, message: `Too many attempts. Try again in ${fmtWait(r.lockedFor)}.` };
        return {
          ok: false,
          message:
            r.attemptsLeft && r.attemptsLeft <= 2
              ? `That code doesn't match. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? "try" : "tries"} left before a short lock.`
              : "That code doesn't match.",
        };
      },
      changeCode: async (current, next) => {
        const r = await adminChangePin({ data: { pin: pinCode, current, next } }).catch(() => null);
        if (!r) return { ok: false, message: "Couldn't reach the server. Check your connection." };
        if (!r.ok) return { ok: false, message: r.error };
        startSession({ token: r.token, expiresAt: r.expiresAt, weak: false });
        return { ok: true };
      },
      refresh: () => void load(pinCode),
      signOut: (reason) => endSession(reason ?? ""),

      appointments,
      byDate: (iso) => appointments.filter((a) => a.date === iso),
      setStatus: (reference, status) => patchMeta(reference, { status }),
      setStaff: (reference, staffId) => patchMeta(reference, { staffId }),
      setPayment: (reference, payment, amount) => patchMeta(reference, { payment, amount }),
      setNote: (reference, note) => patchMeta(reference, { note }),
      reschedule: (reference, date, time) => {
        setRows((rs) => rs.map((r) => (r.reference === reference ? { ...r, date, time } : r)));
        void guard(
          adminUpsertBooking({ data: { pin: pinCode, reference, patch: { date, time } } }),
          "Couldn't move that appointment. It has been reloaded.",
        );
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
        void guard(adminUpsertBooking({
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
        }), "Couldn't save the walk-in. Please add it again.").then(() => {
          // the server issues the real booking ID; drop the local placeholder and reload
          setWalkIns((w) => w.filter((x) => x.reference !== entry.reference));
          setRows((rs) => rs.filter((r) => r.reference !== entry.reference));
          void load(pinCode);
        });
        return appt;
      },

      staff,
      addStaff: (name, role) =>
        saveStaff([...staff, { id: "st-" + Math.random().toString(36).slice(2, 8), name, role, active: true }]),
      toggleStaff: (id) => saveStaff(staff.map((x) => (x.id === id ? { ...x, active: !x.active } : x))),
      removeStaff: (id) => saveStaff(staff.filter((x) => x.id !== id)),

      pin: pinCode,
      settings,
      updateSettings: (patch) => {
        if (patch.acceptingBookings !== undefined) {
          void guard(
            adminSaveConfig({ data: { pin: pinCode, config: { accepting: patch.acceptingBookings } } }),
            "Couldn't change online booking. Please try again.",
          );
        }
        setSettings((s) => ({ ...s, ...patch }));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, walkIns, metas, staff, settings, hydrated, authed, pinCode, weakCode, signOutReason]);

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
  pending: "Pending",
  upcoming: "Confirmed",
  arrived: "Checked in",
  "in-chair": "In service",
  completed: "Completed",
  "no-show": "No show",
  cancelled: "Cancelled",
};

export const isLive = (s: ApptStatus) =>
  s === "pending" || s === "upcoming" || s === "arrived" || s === "in-chair";

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
