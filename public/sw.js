// Market Empire — service worker : notifications reçues quand le jeu est fermé, et installation de l'appli.
// (Pas de mise en cache : le site se charge toujours depuis le réseau.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Chrome ne propose d'installer le jeu (invitation « Installer », bouton du jeu en un geste) que si le service worker
// répond lui-même aux pages. Il les demande au réseau, comme avant ; hors connexion, une page simple le dit.
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Empire</title>'
  + '<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;color:#e2e8f0;font:16px system-ui;text-align:center;padding:24px">'
  + '<div><p style="font-size:20px;font-weight:700;margin:0 0 8px">Pas de connexion</p><p style="margin:0 0 20px;color:#94a3b8">Market Empire a besoin d\'internet pour suivre les marchés.</p>'
  + '<button onclick="location.reload()" style="font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:12px;background:#2563eb;color:#fff">Réessayer</button></div>';
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // le reste (images, données, Supabase) passe sans détour
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

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
