// @ts-nocheck — vérifié par Deno côté serveur ; les types « BufferSource » du projet web (Node) sont plus stricts sans raison ici.
// Envoi « Web Push » sans bibliothèque : chiffrement du message (RFC 8291, aes128gcm) et signature VAPID (RFC 8292).
// Uniquement WebCrypto : tourne tel quel dans Deno (fonction Supabase) et dans Node (tests).

const enc = new TextEncoder();
export const b64u = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const c of u) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s: string) => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u;
};
const cat = (...parts: Uint8Array[]) => { const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const P256 = { name: "ECDH", namedCurve: "P-256" } as const;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

export interface Subscription { endpoint: string; p256dh: string; auth: string }
/** Clés du serveur : `publicKey` = clé d'application donnée au navigateur (65 octets, base64url), `privateJwk` = clé de signature. */
export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey }

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

/** Message chiffré pour un abonné : corps de la requête à envoyer à son `endpoint`. */
export async function encrypt(sub: Pick<Subscription, "p256dh" | "auth">, text: string): Promise<Uint8Array> {
  const uaPublic = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const local = await crypto.subtle.generateKey(P256, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, P256, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Un seul enregistrement : le texte, puis l'octet 2 qui marque le dernier
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic, body);
}

/** En-tête d'autorisation VAPID pour ce service de notifications. */
export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

/** Envoie une notification. Renvoie le code HTTP du service (201 = acceptée ; 404 ou 410 = abonnement à supprimer). */
export async function sendPush(sub: Subscription, text: string, keys: VapidKeys, subject: string, ttl = 24 * 3600): Promise<number> {
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal", Authorization: await vapidHeader(sub.endpoint, keys, subject) },
    body: await encrypt(sub, text),
  });
  return r.status;
}
