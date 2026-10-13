// Market Empire — service worker : le jeu s'ouvre sans réseau, notifications reçues quand le jeu est fermé.
//
// Hors ligne : tous les fichiers du site sont gardés sur l'appareil (liste écrite par scripts/sw-precache.mjs à chaque
// version). Les pages et données sont demandées au réseau d'abord (toujours la dernière version quand il y a du réseau),
// la copie gardée ne sert que sans réseau. Les fichiers de /_next/static/ ne changent jamais de contenu : copie d'abord.
// Supabase (sauvegarde, cours, joueurs) n'est jamais mis en cache ici.
const PRECACHE = { version: "dev", files: [] };
const CACHE = `market-empire-${PRECACHE.version}`;
const scoped = (path) => new URL(path, self.registration.scope).href;
const immutable = (url) => url.includes("/_next/static/");

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Un fichier qui ne passe pas ne bloque pas les autres ; ceux déjà gardés (version précédente) ne sont pas retéléchargés
    await Promise.allSettled(PRECACHE.files.map(async (path) => {
      const url = scoped(path);
      const kept = immutable(url) ? await caches.match(url) : null;
      if (kept) return cache.put(url, kept);
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) await cache.put(url, r);
    }));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("market-empire-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Empire</title>'
  + '<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0f172a;color:#e2e8f0;font:16px system-ui;text-align:center;padding:24px">'
  + '<div><p style="font-size:20px;font-weight:700;margin:0 0 8px">Pas de connexion</p><p style="margin:0 0 20px;color:#94a3b8">Ouvrez le jeu une fois avec du réseau : il marchera ensuite sans.</p>'
  + '<button onclick="location.reload()" style="font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:12px;background:#2563eb;color:#fff">Réessayer</button></div>';

/** Réseau d'abord ; sans réponse en 6 s (réseau qui rame) ou sans réseau, la copie gardée. */
async function networkFirst(req, isPage) {
  const cache = await caches.open(CACHE);
  const key = new URL(req.url); key.search = ""; key.hash = "";
  const fromNet = fetch(req).then((r) => { if (r.ok && r.type === "basic") cache.put(key.href, r.clone()); return r; });
  fromNet.catch(() => {}); // sa fin éventuelle, après la copie gardée, ne doit pas faire d'erreur
  const slow = new Promise((ok) => setTimeout(ok, 6000, null));
  const first = await Promise.race([fromNet.catch(() => null), slow]);
  if (first) return first;
  const kept = await cache.match(key.href, { ignoreSearch: true })
    ?? (isPage ? await cache.match(scoped("./")) : undefined); // page jamais ouverte : l'accueil, le jeu s'y retrouve
  if (kept) return kept;
  try { return await fromNet; } catch {
    if (isPage) return new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    throw new Error("hors ligne");
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.registration.scope)) return; // Supabase et le reste du web : sans détour
  if (immutable(req.url)) {
    e.respondWith(caches.match(req.url).then((hit) => hit ?? fetch(req).then(async (r) => {
      if (r.ok) (await caches.open(CACHE)).put(req.url, r.clone());
      return r;
    })));
    return;
  }
  e.respondWith(networkFirst(req, req.mode === "navigate"));
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
