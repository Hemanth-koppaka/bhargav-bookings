CREATE TABLE public.service_categories (
  id text PRIMARY KEY,
  gender text NOT NULL CHECK (gender IN ('men','women')),
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gender, slug)
);
CREATE TABLE public.services (
  id text PRIMARY KEY,
  gender text NOT NULL CHECK (gender IN ('men','women')),
  category_id text NOT NULL REFERENCES public.service_categories(id) ON UPDATE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  price integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  price_from boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_category_idx ON public.services(category_id, display_order);
CREATE TABLE public.opening_hours (
  day_of_week smallint PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT true,
  opening_time time NOT NULL DEFAULT '10:00',
  closing_time time NOT NULL DEFAULT '20:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.opening_exceptions (
  date date PRIMARY KEY,
  is_open boolean NOT NULL DEFAULT false,
  opening_time time,
  closing_time time,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.service_categories, public.services, public.opening_hours, public.opening_exceptions, public.site_settings TO service_role;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER categories_touch BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER hours_touch BEFORE UPDATE ON public.opening_hours FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER exceptions_touch BEFORE UPDATE ON public.opening_exceptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.bookings ADD COLUMN services_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON TABLE public.salon_config IS 'DEPRECATED: replaced by service_categories, services, opening_hours, site_settings';