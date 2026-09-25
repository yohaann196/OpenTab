/* OpenTab service worker: push notifications + offline shell for private pages. */
const CACHE = "opentab-v1";
// Works at the domain root or under a sub-path (e.g. /opentab): derive it from the scope.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const OFFLINE = `${BASE}/offline.html`;
const ICON = `${BASE}/icon.svg`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE]).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first for page navigations; fall back to the last copy (or an offline page)
// so a judge who loses Wi-Fi mid-round still sees their assignment.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  const url = new URL(req.url);
  if (!url.pathname.startsWith(`${BASE}/p/`) && !url.pathname.startsWith(`${BASE}/t/`)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE)
          .then((c) => c.put(req, copy))
          .catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE))),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "OpenTab", body: "", url: `${BASE}/` };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: ICON,
      badge: ICON,
      data: { url: data.url },
      tag: data.tag || undefined,
      renotify: !!data.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || `${BASE}/`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
