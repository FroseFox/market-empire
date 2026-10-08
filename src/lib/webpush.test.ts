/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — les types « BufferSource » de Node et du navigateur divergent ; le test tourne tel quel

import { describe, expect, it } from "vitest";
import { b64u, encrypt, generateVapidKeys, unb64u, vapidHeader } from "../../supabase/functions/send-push/webpush";

// Côté « navigateur » : déchiffre un message Web Push (RFC 8291) avec sa clé privée et son secret.
const enc = new TextEncoder();
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array, auth: Uint8Array) {
  const salt = body.slice(0, 16), idLen = body[20], asPublic = body.slice(21, 21 + idLen), data = body.slice(21 + idLen);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, data));
  return { text: new TextDecoder().decode(plain.slice(0, -1)), last: plain[plain.length - 1], recordSize: new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0) };
}

describe("envoi Web Push", () => {
  it("chiffre un message que l'abonné sait relire", async () => {
    const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
    const text = JSON.stringify({ title: "Votre ville est pleine", body: "Nova City — éàü" });
    const body = await encrypt({ p256dh: b64u(uaPublic), auth: b64u(auth) }, text);
    const back = await decrypt(body, ua, uaPublic, auth);
    expect(back.text).toBe(text);
    expect(back.last).toBe(2);
    expect(back.recordSize).toBe(4096);
  });

  it("signe l'en-tête VAPID avec la clé annoncée", async () => {
    const keys = await generateVapidKeys();
    expect(unb64u(keys.publicKey)).toHaveLength(65);
    const h = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", keys, "https://exemple.test/", 1_700_000_000_000);
    const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [head, claims, sig] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(unb64u(claims)))).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 12 * 3600, sub: "https://exemple.test/" });
    const pub = await crypto.subtle.importKey("raw", unb64u(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64u(sig), enc.encode(`${head}.${claims}`))).toBe(true);
  });
});
