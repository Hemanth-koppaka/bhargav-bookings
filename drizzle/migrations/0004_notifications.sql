-- Booking notifications (WhatsApp / SMS through a provider such as MSG91).
-- Settings live in one row the admin edits; provider secrets never do (they
-- are server environment secrets). Every message attempt is one row in
-- notification_logs, keyed so the same booking event can never be sent twice.
-- Safe to re-run.

-- ── Settings (single row, id = 1) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL DEFAULT 'msg91',
  -- channels
  customer_whatsapp_enabled boolean NOT NULL DEFAULT true,
  customer_sms_enabled boolean NOT NULL DEFAULT false,
  admin_whatsapp_enabled boolean NOT NULL DEFAULT true,
  admin_sms_enabled boolean NOT NULL DEFAULT false,
  fallback_enabled boolean NOT NULL DEFAULT true,       -- WhatsApp failed → try SMS
  -- which messages go out
  customer_confirmation_enabled boolean NOT NULL DEFAULT true,
  customer_updates_enabled boolean NOT NULL DEFAULT true,   -- reschedule / cancel
  admin_new_booking_enabled boolean NOT NULL DEFAULT true,
  admin_updates_enabled boolean NOT NULL DEFAULT true,
  customer_reminder_24h boolean NOT NULL DEFAULT true,
  customer_reminder_2h boolean NOT NULL DEFAULT true,
  -- recipients (E.164, e.g. +919876543210)
  admin_notification_phone text NOT NULL DEFAULT '',
  test_phone text NOT NULL DEFAULT '',
  -- public address used in "Manage your booking" links when the booking has none
  public_site_url text NOT NULL DEFAULT '',
  -- provider configuration that is not secret: sender number, template names
  -- per event and channel, API endpoints (see the admin Notifications screen)
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.notification_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Message log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id bigserial PRIMARY KEY,
  -- booking + event (+ occurrence) + recipient + channel: one message, ever
  idempotency_key text NOT NULL UNIQUE,
  booking_id text NOT NULL,                 -- booking reference, e.g. HB-2026-00124
  event_type text NOT NULL,                 -- BOOKING_CONFIRMED, BOOKING_REMINDER_24H, …
  recipient_type text NOT NULL,             -- customer | admin | test
  recipient_phone text NOT NULL DEFAULT '', -- E.164
  channel text NOT NULL,                    -- whatsapp | sms
  provider text NOT NULL DEFAULT '',
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('scheduled', 'queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'skipped')),
  error_code text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,                -- reminders: when to send
  next_attempt_at timestamptz,              -- failed: when a retry is allowed
  -- the exact values sent (from the booking snapshot at the time)
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_logs_booking_idx ON public.notification_logs (booking_id, created_at);
CREATE INDEX IF NOT EXISTS notification_logs_due_idx ON public.notification_logs (status, scheduled_for, next_attempt_at);
CREATE INDEX IF NOT EXISTS notification_logs_provider_idx ON public.notification_logs (provider_message_id);
CREATE INDEX IF NOT EXISTS notification_logs_recent_idx ON public.notification_logs (created_at DESC);

-- ── Consent and link origin on bookings ─────────────────────────────────
-- Booking-related (transactional) messages only; marketing consent is separate
-- and never implied by booking.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS notify_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_origin text NOT NULL DEFAULT '';
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notify_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;

-- ── Housekeeping ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notification_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notification_logs_touch ON public.notification_logs;
CREATE TRIGGER notification_logs_touch BEFORE UPDATE ON public.notification_logs
  FOR EACH ROW EXECUTE FUNCTION public.notification_touch();
DROP TRIGGER IF EXISTS notification_settings_touch ON public.notification_settings;
CREATE TRIGGER notification_settings_touch BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.notification_touch();

-- Server only: no public access to settings or message logs.
GRANT ALL ON public.notification_settings, public.notification_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.notification_logs_id_seq TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
