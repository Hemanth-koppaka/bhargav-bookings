-- Stylists work in parallel.
--
-- Every booking records its stylist (staff_id), and the double-booking guard
-- refuses an overlap only with the SAME stylist, so Bhargav being booked at
-- 10:00 never blocks the men's stylist or Neha at 10:00.
--
-- This is the small part of 0008 the site needs: the stylists themselves stay
-- where they are today (the salon's staff list in site_settings), so nothing
-- about the team changes. No stylist table is required, so there is no
-- foreign key on staff_id.
--
-- Safe to run more than once.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS staff_choice text NOT NULL DEFAULT 'any';

DO $$ BEGIN
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_staff_choice_chk CHECK (staff_choice IN ('any', 'specific'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS bookings_staff_date_idx ON public.bookings (staff_id, date);

-- Bookings made before this update kept their stylist in meta: copy it across.
UPDATE public.bookings
SET staff_id = (meta ->> 'staff_id')::uuid,
    staff_choice = CASE WHEN meta ->> 'staff_choice' = 'specific' THEN 'specific' ELSE 'any' END
WHERE staff_id IS NULL
  AND meta ->> 'staff_id' ~ '^[0-9a-fA-F-]{36}$';

-- ── Double-booking guard, per stylist ─────────────────────────────────
-- Serialises writes per stylist and day; refuses an active booking that
-- overlaps another active booking of the SAME stylist. Bookings without a
-- stylist keep the old salon-wide rule among themselves.
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
