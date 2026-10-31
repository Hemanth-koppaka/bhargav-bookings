-- Bhargav's Signature is a 30-minute appointment on both menus (salon request).
-- Existing bookings keep the duration they were booked with.
UPDATE public.services
SET duration_minutes = 30
WHERE lower(name) LIKE 'bhargav%signature%' AND duration_minutes <> 30;

INSERT INTO public.audit_log (actor, action, entity, summary)
SELECT 'system', 'service.update', 'service', 'Bhargav''s Signature duration set to 30 min'
WHERE to_regclass('public.audit_log') IS NOT NULL;
