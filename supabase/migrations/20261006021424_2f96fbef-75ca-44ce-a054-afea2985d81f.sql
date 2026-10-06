CREATE TABLE public.bookings (
  reference text PRIMARY KEY,
  audience text NOT NULL,
  service_ids text[] NOT NULL DEFAULT '{}',
  date date NOT NULL,
  time int NOT NULL,
  slots int NOT NULL DEFAULT 1,
  customer jsonb NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  source text NOT NULL DEFAULT 'online',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX bookings_date_idx ON public.bookings(date);

CREATE TABLE public.salon_config (
  id int PRIMARY KEY DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.salon_config TO service_role;
ALTER TABLE public.salon_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_secret (
  id int PRIMARY KEY DEFAULT 1,
  pin text NOT NULL
);
GRANT ALL ON public.admin_secret TO service_role;
ALTER TABLE public.admin_secret ENABLE ROW LEVEL SECURITY;
INSERT INTO public.admin_secret (id, pin) VALUES (1, '1143');
INSERT INTO public.salon_config (id, data) VALUES (1, '{}'::jsonb);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER config_touch BEFORE UPDATE ON public.salon_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();