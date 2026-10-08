"use client";
// Notifications du jeu : ce qui mérite l'attention du joueur sans qu'il ait à chercher.
// - subvention disponible, rang de ville gagné, forte variation d'un actif détenu, ville qui vieillit ;
// - gardées sur l'appareil (les 30 dernières), affichées par la cloche de la barre du haut ;
// - si le joueur l'autorise, aussi en notification du navigateur quand l'onglet est en arrière-plan.
// Le jeu informe, il ne conseille jamais d'acheter ou de vendre.
import { create } from "zustand";
import { useGame } from "@/store/game";
import * as E from "@/lib/game/engine";
import { CITY_RANKS, FEATURES } from "@/lib/game/config";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { play } from "@/lib/sound";
import { useAuth } from "@/lib/auth";
import { initPush } from "@/lib/push";

export interface Notif { id: string; at: number; title: string; text: string; href: string; tone: "good" | "bad" | "info"; read: boolean }
/** Variation sur un jour à partir de laquelle un actif détenu est signalé. */
export const BIG_MOVE = 0.05;
const KEY = "market-empire-notifs", MAX = 30;

function load(): Notif[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.slice(0, MAX) : []; } catch { return []; }
}
function save(list: Notif[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* non mémorisé */ } }

interface Store {
  list: Notif[];
  /** Le joueur a autorisé les notifications du navigateur. */
  system: boolean;
  push: (n: Omit<Notif, "at" | "read">) => void;
  readAll: () => void;
  clear: () => void;
  enableSystem: () => Promise<boolean>;
}
export const useNotifs = create<Store>((set, get) => ({
  list: [],
  system: false,
  push: (n) => {
    if (get().list.some((x) => x.id === n.id)) return; // déjà signalé
    const list = [{ ...n, at: Date.now(), read: false }, ...get().list].slice(0, MAX);
    set({ list }); save(list);
    // Le message s'affiche sans passer par le son d'erreur : une notification a sa propre sonnerie
    useGame.getState().notify(n.title, "ok");
    play(n.id.startsWith("rank-") ? "rank" : "notify");
    // Onglet en arrière-plan : notification du navigateur si elle est autorisée
    if (get().system && typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(`Market Empire · ${n.title}`, { body: n.text, tag: n.id }); } catch { /* non pris en charge ici */ }
    }
  },
  readAll: () => { const list = get().list.map((n) => ({ ...n, read: true })); set({ list }); save(list); },
  clear: () => { set({ list: [] }); save([]); },
  enableSystem: async () => {
    if (typeof Notification === "undefined") return false;
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    set({ system: p === "granted" });
    return p === "granted";
  },
}));

let started = false;
/** Surveille la partie et les cours, et crée les notifications. À appeler une fois la partie chargée. */
export function startNotifs() {
  if (started || typeof window === "undefined") return;
  started = true;
  useNotifs.setState({ list: load(), system: typeof Notification !== "undefined" && Notification.permission === "granted" });
  // Notifications quand le jeu est fermé : l'abonnement de l'appareil suit le compte connecté
  void initPush();
  useAuth.subscribe((s, p) => { if (s.user?.id !== p.user?.id) void initPush(); });
  const { push } = useNotifs.getState();
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

  // État de départ : on ne signale que ce qui CHANGE ensuite (pas tout ce qui est déjà vrai à l'ouverture)
  let g = useGame.getState().game, city = E.computeCity(g);
  let rank = city.rank, wearHigh = city.wear >= 0.5, asleep = (g.branches?.length ?? 0) - city.branches, eventUntil = g.event?.until ?? 0;
  const known = new Set(E.goalStatuses(g, city).filter((s) => s.done).map((s) => s.goal.id));

  useGame.subscribe((s, prev) => {
    if (s.game !== prev.game) {
      // Nouvelle partie : on repart de zéro sans rien signaler
      if (s.game.createdAt !== g.createdAt) {
        g = s.game; city = E.computeCity(g); rank = city.rank; wearHigh = city.wear >= 0.5; asleep = (g.branches?.length ?? 0) - city.branches;
        known.clear(); for (const st of E.goalStatuses(g, city)) if (st.done) known.add(st.goal.id);
        eventUntil = g.event?.until ?? 0;
        return;
      }
      g = s.game; city = E.computeCity(g);
      for (const st of E.goalStatuses(g, city)) {
        if (!st.done || known.has(st.goal.id)) continue;
        known.add(st.goal.id);
        if (!st.claimed) push({ id: `goal-${g.createdAt}-${st.goal.id}`, tone: "good", title: "Subvention à encaisser", text: `${st.goal.label} : ${fmt(st.goal.reward)} € vous attendent dans Ville › Objectifs.`, href: "/ville" });
      }
      if (city.rank > rank) push({ id: `rank-${g.createdAt}-${city.rank}`, tone: "good", title: `Nouveau rang : ${CITY_RANKS[city.rank].name}`, text: `Votre ville compte ${fmt(g.population)} habitants.`, href: "/ville" });
      for (const f of FEATURES) if (f.rank > rank && f.rank <= city.rank) push({ id: `feature-${g.createdAt}-${f.id}`, tone: "info", title: `Nouveau : ${f.label}`, text: f.text, href: f.href });
      rank = city.rank;
      // Événement de la semaine : signalé quand il commence
      if (g.event && g.event.until !== eventUntil && city.event) push({ id: `event-${g.createdAt}-${g.event.until}`, tone: city.event.kind === "bonus" ? "good" : "bad", title: city.event.name, text: `${city.event.text} ${city.event.effect}, pendant ${city.event.daysLeft} jours de ville.`, href: "/ville" });
      eventUntil = g.event?.until ?? eventUntil;
      if (city.wear >= 0.5 && !wearHigh) push({ id: `wear-${g.createdAt}-${g.day}`, tone: "bad", title: "Votre ville vieillit", text: `Vétusté de ${Math.round(city.wear * 100)} % : l'entretien augmente jusqu'à la prochaine rénovation.`, href: "/ville" });
      wearHigh = city.wear >= 0.5;
      const nowAsleep = (g.branches?.length ?? 0) - city.branches;
      if (nowAsleep > asleep) push({ id: `branch-${g.createdAt}-${g.day}-${nowAsleep}`, tone: "info", title: "Un site d'entreprise est en sommeil", text: "Vous ne détenez plus la participation de départ : il ne rapporte plus rien.", href: "/ville" });
      asleep = nowAsleep;
    }
    if (s.quotes !== prev.quotes) {
      // Forte variation d'un actif détenu : une fois par actif et par jour réel
      const day = new Date().toISOString().slice(0, 10);
      for (const symbol of Object.keys(s.game.holdings)) {
        const q = s.quotes[symbol];
        if (!q || Math.abs(q.change) < BIG_MOVE) continue;
        const pct = `${q.change > 0 ? "+" : "−"}${(Math.abs(q.change) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
        push({ id: `move-${symbol}-${day}`, tone: q.change > 0 ? "good" : "bad", title: `${ASSET_BY_SYMBOL[symbol]?.name ?? symbol} : ${pct} sur un jour`, text: "Un actif de votre portefeuille bouge fortement.", href: "/portefeuille" });
      }
    }
  });
}
