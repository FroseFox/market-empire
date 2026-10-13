// Market Empire — service worker : notifications reçues quand le jeu est fermé, et installation de l'appli.
// (Pas de mise en cache : le site se charge toujours depuis le réseau.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Chrome ne propose d'installer le jeu (invitation « Installer », bouton du jeu en un geste) que si le service worker
// répond lui-même aux pages. Il les demande au réseau, comme avant ; hors connexion, une page simple le dit.
// Même écran que dans le jeu (components/NoNetwork.tsx), et la page se recharge toute seule au retour du réseau.
const OFFLINE = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0f172a"><title>Pas de connexion · Market Empire</title>'
  + '<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;color:#cbd5e1;font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">'
  + '<div style="max-width:340px"><div style="margin:0 auto;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.1);display:grid;place-items:center">'
  + '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.47"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/></svg></div>'
  + '<h1 style="margin:20px 0 8px;font-size:24px;color:#fff">Pas de connexion</h1>'
  + '<p style="margin:0 0 8px">Market Empire a besoin d\'internet : la Bourse, votre sauvegarde et les autres joueurs sont en ligne.</p>'
  + '<p style="margin:0;font-size:13px;color:#94a3b8">Votre partie est en sécurité. Le jeu reprend tout seul dès que le réseau revient.</p>'
  + '<button onclick="location.reload()" style="margin-top:24px;width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:12px;background:#2563eb;color:#fff">Réessayer</button>'
  + '<p style="margin-top:12px;font-size:11px;color:#64748b">Vérifiez le wifi ou les données mobiles, et le mode avion.</p></div>'
  + '<script>addEventListener("online",function(){location.reload()})</script>';
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
