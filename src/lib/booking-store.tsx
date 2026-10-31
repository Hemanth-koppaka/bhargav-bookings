import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { findService, type Audience, type Service } from "./salon";
import { createBooking, findMyBooking, updateMyBooking } from "./salon.functions";

export type BookingStatus = "confirmed" | "cancelled";

export type Customer = {
  name: string;
  phone: string;
  email: string;
  notes?: string;
  /** Storage paths of reference photos (server-set; removed after the visit). */
  photos?: string[];
};

export type RefPhoto = { path: string; thumb: string };

export type Draft = {
  audience: Audience | null;
  serviceIds: string[];
  date: string | null; // ISO yyyy-mm-dd
  time: number | null; // minutes from midnight
  customer: Customer | null;
  /** Identifies this booking's uploads before it has a reference. */
  draftId?: string;
  /** Optional reference photos already uploaded (deleted after the visit). */
  photos?: RefPhoto[];
};

export type Booking = {
  reference: string;
  audience: Audience;
  serviceIds: string[];
  date: string;
  time: number;
  customer: Customer;
  status: BookingStatus;
  createdAt: string;
};

const EMPTY: Draft = {
  audience: null,
  serviceIds: [],
  date: null,
  time: null,
  customer: null,
};

const DRAFT_KEY = "hbb.draft.v1";
const BOOKINGS_KEY = "hbb.bookings.v1";

type Ctx = {
  draft: Draft;
  update: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;
  setAudience: (a: Audience) => void;
  toggleService: (id: string) => void;
  removeService: (id: string) => void;
  resetDraft: () => void;
  selected: Service[];
  totalSlots: number;
  /** Service time of the selection, in minutes. */
  totalMinutes: number;
  totalPrice: number;
  hasFromPricing: boolean;
  bookings: Booking[];
  commitBooking: () => Promise<{ booking: Booking } | { error: string }>;
  findBooking: (reference: string, phone: string) => Promise<Booking | undefined>;
  cancelBooking: (reference: string) => Promise<ChangeResult>;
  rescheduleBooking: (reference: string, date: string, time: number) => Promise<ChangeResult>;
  hydrated: boolean;
};

export type ChangeResult = { ok: true } | { ok: false; error: string };

const OFFLINE = "We couldn't reach the salon. Check your connection and try again.";

const BookingContext = createContext<Ctx | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}


export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraft(read<Draft>(DRAFT_KEY, EMPTY));
    setBookings(read<Booking[]>(BOOKINGS_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  }, [bookings, hydrated]);

  const value = useMemo<Ctx>(() => {
    const selected: Service[] = draft.audience
      ? draft.serviceIds
          .map((id) => findService(draft.audience as Audience, id))
          .filter((x): x is Service => Boolean(x))
      : [];

    const totalMinutes = selected.reduce((n, s) => n + (s.minutes ?? s.slots * 30), 0);
    const totalSlots = Math.ceil(totalMinutes / 30);
    const totalPrice = selected.reduce((n, s) => n + s.price, 0);
    const hasFromPricing = selected.some((s) => s.from);

    return {
      draft,
      hydrated,
      selected,
      totalSlots,
      totalMinutes,
      totalPrice,
      hasFromPricing,
      bookings,
      update: (patch) => setDraft((d) => ({ ...d, ...(typeof patch === "function" ? patch(d) : patch) })),
      setAudience: (a) =>
        setDraft((d) =>
          d.audience === a
            ? { ...d, audience: a }
            : { ...EMPTY, audience: a, customer: d.customer },
        ),
      toggleService: (id) =>
        setDraft((d) => ({
          ...d,
          serviceIds: d.serviceIds.includes(id)
            ? d.serviceIds.filter((x) => x !== id)
            : [...d.serviceIds, id],
          time: null,
        })),
      removeService: (id) =>
        setDraft((d) => ({ ...d, serviceIds: d.serviceIds.filter((x) => x !== id), time: null })),
      resetDraft: () => setDraft(EMPTY),
      commitBooking: async () => {
        if (!draft.audience || !draft.date || draft.time == null || !draft.customer)
          return { error: "Your booking is incomplete." };
        const booking: Booking = {
          reference: "",
          audience: draft.audience,
          serviceIds: draft.serviceIds,
          date: draft.date,
          time: draft.time,
          customer: draft.customer,
          status: "confirmed",
          createdAt: new Date().toISOString(),
        };
        try {
          const { reference: _unused, ...payload } = booking;
          const res = await createBooking({
            data: {
              ...payload,
              customer: { ...booking.customer, email: booking.customer.email ?? "" },
              ...(draft.photos?.length ? { photos: draft.photos.map((x) => x.path) } : {}),
            },
          });
          if (!res.ok) return { error: res.error };
          booking.reference = res.reference; // issued by the salon (HB-2026-00124)
        } catch {
          return { error: "We couldn't reach the salon. Check your connection and try again." };
        }
        setBookings((b) => [booking, ...b]);
        return { booking };
      },
      findBooking: async (reference, phone) => {
        try {
          const { booking: r } = await findMyBooking({ data: { reference, phone } });
          if (!r) return undefined;
          const found: Booking = {
            reference: r.reference,
            audience: r.audience,
            serviceIds: r.serviceIds,
            date: r.date,
            time: r.time,
            customer: r.customer,
            status: r.status,
            createdAt: r.createdAt,
          };
          setBookings((b) => [found, ...b.filter((x) => x.reference !== found.reference)]);
          return found;
        } catch {
          return undefined;
        }
      },
      // Both changes are confirmed by the salon's server before the screen updates.
      cancelBooking: async (reference) => {
        const bk = bookings.find((x) => x.reference === reference);
        if (!bk) return { ok: false, error: "Booking not found on this device." };
        const r = await updateMyBooking({
          data: { reference, phone: bk.customer.phone, action: "cancel" },
        }).catch(() => null);
        if (!r) return { ok: false, error: OFFLINE };
        if (!r.ok) return { ok: false, error: ("error" in r && r.error) || "Couldn't cancel this booking." };
        setBookings((b) =>
          b.map((x) => (x.reference === reference ? { ...x, status: "cancelled" as const } : x)),
        );
        return { ok: true };
      },
      rescheduleBooking: async (reference, date, time) => {
        const bk = bookings.find((x) => x.reference === reference);
        if (!bk) return { ok: false, error: "Booking not found on this device." };
        const r = await updateMyBooking({
          data: { reference, phone: bk.customer.phone, action: "reschedule", date, time },
        }).catch(() => null);
        if (!r) return { ok: false, error: OFFLINE };
        if (!r.ok) return { ok: false, error: ("error" in r && r.error) || "Couldn't move this booking." };
        setBookings((b) => b.map((x) => (x.reference === reference ? { ...x, date, time } : x)));
        return { ok: true };
      },
    };
  }, [draft, bookings, hydrated]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside BookingProvider");
  return ctx;
}

export function servicesOf(booking: Booking): Service[] {
  return booking.serviceIds
    .map((id) => findService(booking.audience, id))
    .filter((x): x is Service => Boolean(x));
}
