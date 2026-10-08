// Market Empire — service worker : il ne sert qu'à afficher les notifications reçues quand le jeu est fermé.
// (Pas de mise en cache : le site se charge toujours depuis le réseau.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* message illisible : notification générique */ }
  const text = (v) => (typeof v === "string" ? v.slice(0, 200) : "");
  e.waitUntil(self.registration.showNotification(text(d.title) || "Market Empire", {
    body: text(d.body), tag: text(d.tag) || undefined, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: text(d.url) },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // Seules les pages du jeu sont acceptées (un simple nom, sans adresse)
  const page = /^[a-z]{0,20}$/.test((e.notification.data && e.notification.data.url) || "") ? e.notification.data.url : "";
  const target = new URL(page ? `${page}/` : "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) { if (c.navigate) c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
