// Salon phone alerts (Web Push). Shows the notification the salon's server
// sends for a guest's booking, move or cancellation, and opens the admin
// console on tap. Nothing else: no caching, no network interception.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let m = { title: "Hair by Bhargav", body: "Something changed in the diary.", url: "/admin" };
  try {
    if (event.data) m = { ...m, ...event.data.json() };
  } catch (_) {
    /* keep the default text */
  }
  event.waitUntil(
    self.registration.showNotification(m.title, {
      body: m.body,
      icon: "/icons/app-192.png",
      badge: "/icons/app-badge.png",
      tag: m.tag || undefined,
      renotify: Boolean(m.tag),
      data: { url: m.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith("/admin") && "focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
