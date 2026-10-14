"use client";
// Notifications quand le jeu est fermé (Web Push) : l'appareil s'abonne, le serveur envoie.
// - événements entre joueurs (contrat signé, parts achetées, blocus) : créés par le serveur ;
// - rappel « ville pleine » : programmé d'ici à chaque sauvegarde, pour la date où les logements seront tous occupés.
// Rien n'est demandé au joueur tant qu'il n'a pas touché le bouton de la cloche.
import { create } from "zustand";
import { rpc, useAuth } from "@/lib/auth";
import { BASE_PATH, STATIC_MODE } from "@/lib/market/client";
import { useGame } from "@/store/game";
import * as E from "@/lib/game/engine";
import { cityFullReminder } from "@/lib/pushPlan";

/** unsupported : navigateur sans notifications ; ios : iPhone/iPad où le jeu n'est pas encore installé sur l'écran d'accueil. */
export type PushState = "unsupported" | "ios" | "off" | "on" | "denied";
export const usePush = create<{ state: PushState; busy: boolean }>(() => ({ state: "unsupported", busy: false }));

const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const supported = () => typeof window !== "undefined" && !STATIC_MODE && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
function iosNotInstalled() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}
const worker = () => navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` });

async function send(sub: PushSubscription): Promise<boolean> {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return false;
  return !!(await rpc<boolean>("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
}

/** Même clé ? (l'abonnement a été fait avec la clé actuelle du serveur) */
function sameKey(sub: PushSubscription, key: string) {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // navigateur qui ne la donne pas : on suppose que oui
  const a = new Uint8Array(k), b = unb64u(key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Abonnement de l'appareil, refait s'il le faut. Les notifications sont déjà autorisées : rien n'est demandé au joueur.
 *  Sans ça, un appareil qui avait perdu son abonnement (appli réinstallée, abonnement renouvelé par le navigateur…)
 *  ne recevait plus rien, sans que personne ne s'en aperçoive : le serveur écrivait encore à l'ancienne adresse. */
async function ensureSubscription(): Promise<PushSubscription | null> {
  const key = await rpc<string | null>("push_public_key", {});
  if (!key) return null;
  const reg = (await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`)) ?? (await worker());
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) });
}

let linked: string | null = null;
/** À l'ouverture et à chaque changement de compte : retrouve (ou refait) l'abonnement de l'appareil et le rattache au compte. */
export async function initPush() {
  if (typeof window === "undefined") return;
  if (!supported()) { usePush.setState({ state: iosNotInstalled() ? "ios" : "unsupported" }); return; }
  if (Notification.permission === "denied") { usePush.setState({ state: "denied" }); return; }
  try {
    const uid = useAuth.getState().user?.id ?? null;
    if (Notification.permission !== "granted") { usePush.setState({ state: "off" }); return; }
    if (!uid) {
      const reg = await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
      usePush.setState({ state: (await reg?.pushManager.getSubscription()) ? "on" : "off" });
      return;
    }
    if (linked === uid) return;
    linked = uid;
    const sub = await ensureSubscription();
    if (!sub || !(await send(sub))) { linked = null; usePush.setState({ state: "off" }); return; }
    usePush.setState({ state: "on" });
    lastPlan = undefined; void syncReminder();
  } catch { linked = null; usePush.setState({ state: "off" }); }
}

/** Notification de test vers tous les appareils du joueur. Renvoie le message à afficher. */
export async function testPush(): Promise<string> {
  try {
    const n = await rpc<number>("push_test", {});
    if (n < 0) return "Un test est déjà parti il y a moins d'une minute.";
    if (!n) return "Aucun appareil abonné.";
    return `Envoyée à ${n} appareil${n > 1 ? "s" : ""} : elle arrive dans la minute. Si un appareil ne la reçoit pas, désactivez puis réactivez les notifications dessus.`;
  } catch { return "Le serveur n'a pas répondu."; }
}

/** Active les notifications sur cet appareil. Renvoie `null` si c'est fait, sinon le message à afficher. */
export async function enablePush(): Promise<string | null> {
  if (!supported()) return "Ce navigateur ne sait pas recevoir de notifications.";
  if (!useAuth.getState().user) return "Connectez-vous d'abord.";
  usePush.setState({ busy: true });
  try {
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (p !== "granted") { usePush.setState({ state: p === "denied" ? "denied" : "off" }); return p === "denied" ? "Notifications bloquées : autorisez-les dans les réglages du navigateur." : null; }
    await worker();
    const sub = await ensureSubscription();
    if (!sub) return "Le serveur n'est pas prêt, réessayez dans un instant.";
    if (!(await send(sub))) { await sub.unsubscribe().catch(() => {}); return "Abonnement refusé par le serveur."; }
    linked = useAuth.getState().user?.id ?? null;
    usePush.setState({ state: "on" });
    lastPlan = undefined; void syncReminder();
    return null;
  } catch { return "Activation impossible sur cet appareil."; }
  finally { usePush.setState({ busy: false }); }
}

/** Désactive les notifications sur cet appareil (à faire aussi avant de se déconnecter). */
export async function disablePush() {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      if (useAuth.getState().user) await rpc<boolean>("push_unsubscribe", { p_endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch { /* rien à retirer */ }
  linked = null; lastPlan = undefined;
  usePush.setState({ state: Notification.permission === "denied" ? "denied" : "off" });
}

// Dernier rappel envoyé au serveur (date, ou null = annulé) : on ne le renvoie que s'il a bougé de plus de 10 minutes
let lastPlan: number | null | undefined;
/** Programme (ou annule) le rappel « ville pleine » d'après la partie en cours. Appelé après chaque sauvegarde en ligne. */
export async function syncReminder() {
  if (usePush.getState().state !== "on" || !useAuth.getState().user) return;
  const g = useGame.getState().game;
  if (g.sandbox) return;
  const r = cityFullReminder(g, E.computeCity(g));
  const at = r?.at ?? null;
  if (lastPlan !== undefined && (at === lastPlan || (at !== null && lastPlan !== null && Math.abs(at - lastPlan) < 600_000))) return;
  try {
    await rpc<boolean>("push_remind", { p_kind: "city_full", p_at: r ? new Date(r.at).toISOString() : null, p_title: r?.title ?? "", p_body: r?.body ?? "" });
    lastPlan = at;
  } catch { /* prochaine sauvegarde */ }
}
