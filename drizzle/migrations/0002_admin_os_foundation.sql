-- Admin OS foundation: customers, booking IDs and snapshots, time blocks,
-- activity log, service buffers/archiving, notification scaffolding, and a
-- database-level guard against overlapping bookings.
-- Written to be safe on existing data and safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Customers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  phone_key text NOT NULL DEFAULT '',          -- last 10 digits, used for matching
  email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',              -- internal, never sent to guests
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_key_idx ON public.customers (phone_key) WHERE phone_key <> '';
CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers (lower(name));
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS customers_touch ON public.customers;
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Bookings: ids, snapshots, history ──────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_no bigint,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,        -- service time at booking
  ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ends_at_minute integer,          -- time + duration + buffer
  ADD COLUMN IF NOT EXISTS price_total integer,             -- ₹, whole rupees, at booking
  ADD COLUMN IF NOT EXISTS cancel_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment jsonb NOT NULL DEFAULT '{}'::jsonb,   -- future payments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.bookings
SET duration_minutes = COALESCE(duration_minutes, slots * 30),
    ends_at_minute = COALESCE(ends_at_minute, time + slots * 30)
WHERE duration_minutes IS NULL OR ends_at_minute IS NULL;

UPDATE public.bookings b
SET price_total = s.total
FROM (
  SELECT reference, SUM(COALESCE((x ->> 'price')::int, 0)) AS total
  FROM public.bookings, jsonb_array_elements(services_snapshot) AS x
  GROUP BY reference
) s
WHERE b.reference = s.reference AND b.price_total IS NULL AND jsonb_array_length(b.services_snapshot) > 0;

CREATE SEQUENCE IF NOT EXISTS public.booking_no_seq;
UPDATE public.bookings b
SET booking_no = n.rn
FROM (SELECT reference, ROW_NUMBER() OVER (ORDER BY created_at, reference) AS rn FROM public.bookings) n
WHERE b.reference = n.reference AND b.booking_no IS NULL;
SELECT setval('public.booking_no_seq', GREATEST((SELECT COALESCE(MAX(booking_no), 0) FROM public.bookings), 1),
              (SELECT COUNT(*) > 0 FROM public.bookings));
ALTER TABLE public.bookings ALTER COLUMN booking_no SET DEFAULT nextval('public.booking_no_seq');
CREATE UNIQUE INDEX IF NOT EXISTS bookings_booking_no_idx ON public.bookings (booking_no);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON public.bookings (customer_id);
CREATE INDEX IF NOT EXISTS bookings_status_date_idx ON public.bookings (status, date);
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.booking_no_seq TO service_role;

-- Customers from existing bookings (one per phone number), then link them.
INSERT INTO public.customers (name, phone, phone_key, email, created_at)
SELECT DISTINCT ON (k) customer ->> 'name', customer ->> 'phone', k, COALESCE(customer ->> 'email', ''), created_at
FROM (
  SELECT customer, created_at, RIGHT(regexp_replace(customer ->> 'phone', '\D', '', 'g'), 10) AS k
  FROM public.bookings
) b
WHERE k <> ''
ORDER BY k, created_at DESC
ON CONFLICT DO NOTHING;
UPDATE public.bookings b
SET customer_id = c.id
FROM public.customers c
WHERE b.customer_id IS NULL
  AND c.phone_key = RIGHT(regexp_replace(b.customer ->> 'phone', '\D', '', 'g'), 10)
  AND c.phone_key <> '';

-- Human-friendly booking IDs: HB-2026-00124
CREATE OR REPLACE FUNCTION public.next_booking_reference()
RETURNS TABLE (reference text, booking_no bigint)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.booking_no_seq');
  reference := 'HB-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(n::text, 5, '0');
  booking_no := n;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.next_booking_reference() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_booking_reference() TO service_role;

-- ── Double-booking guard ───────────────────────────────────────────────
-- Serialises writes per day with an advisory lock and refuses any active
-- booking that overlaps another, so two guests can never both win a slot.
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
  -- Unchanged times on a booking that was already active: nothing new is occupied.
  IF TG_OP = 'UPDATE' AND NEW.date = OLD.date AND NEW.time = OLD.time
     AND NEW.ends_at_minute IS NOT DISTINCT FROM OLD.ends_at_minute
     AND OLD.status <> 'cancelled'
     AND COALESCE(OLD.meta ->> 'status', '') NOT IN ('cancelled', 'no-show')
     AND OLD.archived_at IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('hb-booking:' || NEW.date::text));
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.date = NEW.date
      AND b.reference <> NEW.reference
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

-- ── Time blocks (one-off blocked periods and one-day breaks) ───────────
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  kind text NOT NULL DEFAULT 'block' CHECK (kind IN ('block', 'break')),
  reason text NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_blocks_date_idx ON public.time_blocks (date) WHERE archived_at IS NULL;
GRANT ALL ON public.time_blocks TO service_role;
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS time_blocks_touch ON public.time_blocks;
CREATE TRIGGER time_blocks_touch BEFORE UPDATE ON public.time_blocks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Activity log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT 'admin',
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  before jsonb,
  after jsonb,
  reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON public.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity, entity_id);
GRANT ALL ON public.audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ── Services & categories ──────────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.services ADD CONSTRAINT services_buffer_nonneg CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Notifications (templates now; delivery providers later) ───────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  event text NOT NULL,                 -- booking_created, booking_rescheduled, reminder_24h, …
  channel text NOT NULL,               -- whatsapp | sms | email
  enabled boolean NOT NULL DEFAULT false,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event, channel)
);
CREATE TABLE IF NOT EXISTS public.notification_log (
  id bigserial PRIMARY KEY,
  booking_reference text NOT NULL,
  event text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued',   -- queued | sent | failed | skipped
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_reference, event, channel)  -- never send the same reminder twice
);
GRANT ALL ON public.notification_templates, public.notification_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notification_log_id_seq TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
