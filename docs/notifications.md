# Booking notifications (WhatsApp / SMS)

Bookings are saved first; messages are sent afterwards and can never change or
cancel a booking. Until the provider is connected every message is recorded as
**skipped**, never as sent.

## How it works

```
guest books ─▶ booking saved ─▶ notifyBookingEvent()
                                   ├─ guest: WhatsApp (if consented) ─▶ SMS fallback
                                   ├─ salon: WhatsApp ─▶ SMS fallback
                                   └─ reminders scheduled (24 h, 2 h)
cron every 10 min ─▶ /api/notifications/dispatch  (reminders, retries)
MSG91 reports    ─▶ /api/notifications/webhook   (sent / delivered / failed)
```

- Code: `src/lib/notify/` (messages, provider interface, MSG91 adapter, service).
- Tables: `notification_settings` (one row) and `notification_logs` (migration 0004).
- One row per message; `idempotency_key` (booking + event [+ appointment time] +
  recipient + phone + channel) is unique, so a repeated trigger never sends twice.
- Messages use the booking's stored snapshot (services, price, duration), never
  the current menu.
- Failed sends retry up to 3 times (5, 10, 20 min) when the error is temporary.
  An attempt with an unknown outcome is never resent automatically.

## Activation checklist

1. **MSG91 account**: complete KYC (new accounts send demo text until then).
2. **WhatsApp**: connect the salon's WhatsApp Business number in MSG91. A number
   on the WhatsApp Business API usually can't also be used in the WhatsApp app.
3. **Templates**: in Admin → Notifications → MSG91 setup, each message lists its
   variables in order and a sample. Create matching templates:
   - WhatsApp: utility templates approved by Meta (`{{1}}`, `{{2}}`…).
   - SMS: DLT-registered templates / MSG91 flows (`##var1##`, `##var2##`…).
   Enter the template names / ids next to each message.
4. **Server secrets** (Lovable project secrets — never in code or the browser):
   - `MSG91_AUTH_KEY` — MSG91 API key
   - `MSG91_WEBHOOK_SECRET` — any long random string
5. **Delivery reports**: in MSG91, set the WhatsApp and SMS report webhook to
   `https://<your-site>/api/notifications/webhook?key=<MSG91_WEBHOOK_SECRET>`.
6. **Reminders**: schedule `POST https://<your-site>/api/notifications/dispatch`
   every 10 minutes with Lovable cron (it sends `Authorization: Bearer
   LOVABLE_CRON_SECRET`).
7. **Admin → Notifications**: set the salon alert number and a test number, save,
   then use **Test** to send a sample. "Sent" means MSG91 accepted it;
   "Delivered" appears only when MSG91 reports delivery.

The MSG91 request formats follow MSG91's documented v5 APIs (WhatsApp bulk
template endpoint, SMS Flow). If MSG91 changes them, the endpoints can be
overridden in `provider_config.endpoints`, and the adapter is a single file.

## Consent

The details step has a "Send my booking confirmation, changes and reminders on
WhatsApp/SMS" box (ticked by default). Without it the guest gets no WhatsApp;
SMS goes only if guest SMS is switched on. This covers booking messages only;
marketing consent is separate (`customers.marketing_consent`) and never implied.
