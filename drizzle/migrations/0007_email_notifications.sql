-- Free email channel for booking messages (Brevo or Resend free plans).
-- The API key is a server secret (BREVO_API_KEY / RESEND_API_KEY), never stored here.
-- Safe to re-run.
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS customer_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_notification_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'brevo',
  ADD COLUMN IF NOT EXISTS email_from text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_from_name text NOT NULL DEFAULT 'Hair by Bhargav';

-- email messages are logged like WhatsApp/SMS, addressed by email instead of phone
ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS recipient_email text NOT NULL DEFAULT '';
