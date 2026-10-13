"use client";
// Un seul onglet actif par appareil. Deux onglets du jeu ouverts en même temps faisaient tourner deux villes chacune
// de son côté, et chacune écrasait la sauvegarde de l'autre (sur l'appareil comme en ligne).
// Le dernier onglet ouvert prend la main : les autres se mettent en pause (ni calcul, ni sauvegarde) et proposent
// « Jouer ici », qui recharge la page et reprend la main à son tour.
// Sans BroadcastChannel (très vieux navigateurs), rien ne change.
import { create } from "zustand";

export const useTab = create<{ paused: boolean }>(() => ({ paused: false }));

/** Vrai quand cet onglet a cédé la main : il ne doit plus rien écrire. */
export const tabPaused = () => useTab.getState().paused;

let channel: BroadcastChannel | null = null;
const listeners: (() => void)[] = [];

/** À appeler une fois au démarrage : prévient les autres onglets que celui-ci prend la main. */
export function claimTab() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  try { channel = new BroadcastChannel("market-empire-tab"); } catch { return; }
  channel.onmessage = (e) => {
    if ((e.data as { t?: string } | null)?.t !== "claim" || tabPaused()) return;
    for (const f of listeners) { try { f(); } catch { /* le reste doit quand même s'arrêter */ } }
    useTab.setState({ paused: true });
  };
  channel.postMessage({ t: "claim" });
}

/** `f` est appelé juste avant la mise en pause de l'onglet (dernière sauvegarde, par exemple). */
export function beforePause(f: () => void) { listeners.push(f); }
