-- Multi-stylist availability.
--  • staff and what each can do (staff_services), weekly hours, breaks,
--    leave (date ranges) and temporary unavailability (date + hours)
--  • salon_closures: the whole salon closed (hours, days, ranges, or until
--    further notice) — separate from a single stylist being unavailable
--  • bookings.staff_id: every booking belongs to one stylist; the guard now
--    refuses overlaps per stylist, so one stylist being booked never blocks
--    the others
-- Safe to re-run; seeds the three current stylists only when there are none.

-- ── Staff ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gender text NOT NULL DEFAULT '' CHECK (gender IN ('', 'male', 'female', 'other')),
  specialties text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  photo_url text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,      -- works here (inactive = removed, history kept)
  bookable boolean NOT NULL DEFAULT true,    -- guests can book them online
  display_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_services (
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);
CREATE INDEX IF NOT EXISTS staff_services_service_idx ON public.staff_services (service_id);

CREATE TABLE IF NOT EXISTS public.staff_working_hours (
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),   -- 0 = Sunday
  is_working boolean NOT NULL DEFAULT true,
  start_minute integer NOT NULL DEFAULT 600 CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute integer NOT NULL DEFAULT 1200 CHECK (end_minute BETWEEN 0 AND 1440),
  PRIMARY KEY (staff_id, day_of_week),
  CHECK (end_minute > start_minute)
);

CREATE TABLE IF NOT EXISTS public.staff_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6),            -- NULL = every working day
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  label text NOT NULL DEFAULT 'Break',
  CHECK (end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS staff_breaks_staff_idx ON public.staff_breaks (staff_id);

CREATE TABLE IF NOT EXISTS public.staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS staff_leave_range_idx ON public.staff_leave (start_date, end_date) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.staff_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  date date NOT NULL,
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  reason text NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS staff_unavailability_date_idx ON public.staff_unavailability (date) WHERE archived_at IS NULL;

-- ── Salon closures (everything blocked) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.salon_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date,                 -- NULL = closed until reopened
  start_minute integer,          -- set (with end_minute) for a closure of a few hours on one date
  end_minute integer,
  reason text NOT NULL DEFAULT '',
  reopened_at timestamptz,       -- set when the admin reopens early
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK ((start_minute IS NULL AND end_minute IS NULL)
      OR (start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute > start_minute AND end_date = start_date))
);
CREATE INDEX IF NOT EXISTS salon_closures_start_idx ON public.salon_closures (start_date) WHERE reopened_at IS NULL;

-- ── Bookings belong to a stylist ──────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_choice text NOT NULL DEFAULT 'any';
DO $$ BEGIN
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_staff_choice_chk CHECK (staff_choice IN ('any', 'specific'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS bookings_staff_date_idx ON public.bookings (staff_id, date);

-- ── Seed the current team (only when there is none) ───────────────────
DO $$
DECLARE b uuid; m uuid; f uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.staff) THEN RETURN; END IF;
  INSERT INTO public.staff (name, gender, specialties, display_order) VALUES ('Bhargav', 'male', 'Founder · Chief Stylist', 0) RETURNING id INTO b;
  INSERT INTO public.staff (name, gender, specialties, display_order) VALUES ('Male Stylist', 'male', 'Men''s hair & grooming', 1) RETURNING id INTO m;
  INSERT INTO public.staff (name, gender, specialties, display_order) VALUES ('Female Stylist', 'female', 'Women''s hair & beauty', 2) RETURNING id INTO f;

  -- Bhargav: every men's service and both Signatures; others: their menu (no Signature)
  INSERT INTO public.staff_services (staff_id, service_id)
    SELECT b, id FROM public.services WHERE gender = 'men' OR lower(name) LIKE 'bhargav%signature%'
    ON CONFLICT DO NOTHING;
  INSERT INTO public.staff_services (staff_id, service_id)
    SELECT m, id FROM public.services WHERE gender = 'men' AND lower(name) NOT LIKE 'bhargav%signature%'
    ON CONFLICT DO NOTHING;
  INSERT INTO public.staff_services (staff_id, service_id)
    SELECT f, id FROM public.services WHERE gender = 'women' AND lower(name) NOT LIKE 'bhargav%signature%'
    ON CONFLICT DO NOTHING;

  -- hours: the salon's current opening hours for everyone
  INSERT INTO public.staff_working_hours (staff_id, day_of_week, is_working, start_minute, end_minute)
    SELECT s.id, h.day_of_week, h.is_open,
           EXTRACT(HOUR FROM h.opening_time)::int * 60 + EXTRACT(MINUTE FROM h.opening_time)::int,
           GREATEST(EXTRACT(HOUR FROM h.closing_time)::int * 60 + EXTRACT(MINUTE FROM h.closing_time)::int,
                    EXTRACT(HOUR FROM h.opening_time)::int * 60 + EXTRACT(MINUTE FROM h.opening_time)::int + 30)
    FROM public.staff s CROSS JOIN public.opening_hours h
    ON CONFLICT DO NOTHING;
  -- lunch moves from the whole salon to each stylist (1–2 PM, editable per person)
  INSERT INTO public.staff_breaks (staff_id, day_of_week, start_minute, end_minute, label)
    SELECT id, NULL, 780, 840, 'Lunch' FROM public.staff;
  INSERT INTO public.site_settings (key, value)
    VALUES ('business_hours', jsonb_build_object('breaksByDay', jsonb_build_object('0','[]'::jsonb,'1','[]'::jsonb,'2','[]'::jsonb,'3','[]'::jsonb,'4','[]'::jsonb,'5','[]'::jsonb,'6','[]'::jsonb)))
    ON CONFLICT (key) DO UPDATE SET value = public.site_settings.value || EXCLUDED.value;

  -- existing bookings were made when the salon worked as one chair: give them owners
  UPDATE public.bookings SET staff_id = CASE WHEN audience = 'women' THEN f ELSE b END WHERE staff_id IS NULL;
END $$;

-- ── Double-booking guard, per stylist ─────────────────────────────────
-- Serialises writes per stylist and day; refuses an active booking that
-- overlaps another active booking of the SAME stylist. Bookings without a
-- stylist (only before this update) keep the old salon-wide rule among
-- themselves.
CREATE OR REPLACE FUNCTION public.bookings_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.duration_minutes := COALESCE(NEW.duration_minutes, NEW.slots * 30);
  NEW.ends_at_minute := NEW.time + NEW.duration_minutes + COALESCE(NEW.buffer_minutes, 0);
  IF NEW.status = 'cancelled'
     OR COALESCE(NEW.meta ->> 'status', '') IN ('cancelled', 'no-show')
     OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.date = OLD.date AND NEW.time = OLD.time
     AND NEW.ends_at_minute IS NOT DISTINCT FROM OLD.ends_at_minute
     AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id
     AND OLD.status <> 'cancelled'
     AND COALESCE(OLD.meta ->> 'status', '') NOT IN ('cancelled', 'no-show')
     AND OLD.archived_at IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('hb-booking:' || COALESCE(NEW.staff_id::text, 'salon') || ':' || NEW.date::text));
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.date = NEW.date
      AND b.reference <> NEW.reference
      AND b.staff_id IS NOT DISTINCT FROM NEW.staff_id
      AND b.status <> 'cancelled'
      AND COALESCE(b.meta ->> 'status', '') NOT IN ('cancelled', 'no-show')
      AND b.archived_at IS NULL
      AND b.time < NEW.ends_at_minute
      AND NEW.time < COALESCE(b.ends_at_minute, b.time + b.slots * 30)
  ) THEN
    RAISE EXCEPTION 'HB_SLOT_TAKEN' USING ERRCODE = 'P0001', HINT = 'That time was just booked.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_guard ON public.bookings;
CREATE TRIGGER bookings_guard BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_guard();

-- ── Housekeeping & access (server only) ───────────────────────────────
DROP TRIGGER IF EXISTS staff_touch ON public.staff;
CREATE TRIGGER staff_touch BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT ALL ON public.staff, public.staff_services, public.staff_working_hours, public.staff_breaks,
  public.staff_leave, public.staff_unavailability, public.salon_closures TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leave ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_closures ENABLE ROW LEVEL SECURITY;
