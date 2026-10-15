"use client";
// Notifications du jeu : ce qui mérite l'attention du joueur sans qu'il ait à chercher.
// - subvention disponible, rang de ville gagné, forte variation d'un actif détenu, ville qui vieillit ;
// - les 30 dernières, affichées par la cloche de la barre du haut ; liées au compte : la même liste (lue, effacée)
//   sur tous les appareils (copie sur l'appareil pour l'affichage immédiat et le jeu hors ligne) ;
// - si le joueur l'autorise, aussi en notification du navigateur quand l'onglet est en arrière-plan.
// Le jeu informe, il ne conseille jamais d'acheter ou de vendre.
import { create } from "zustand";
import { useGame } from "@/store/game";
import * as E from "@/lib/game/engine";
import { CITY_RANKS, FEATURES } from "@/lib/game/config";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { play } from "@/lib/sound";
import { rpc, useAuth } from "@/lib/auth";
import { initPush } from "@/lib/push";
import { missionStatuses, missionText } from "@/lib/game/daily";

export interface Notif { id: string; at: number; title: string; text: string; href: string; tone: "good" | "bad" | "info"; read: boolean }
/** Variation sur un jour à partir de laquelle un actif détenu est signalé. */
export const BIG_MOVE = 0.05;
const KEY = "market-empire-notifs", MAX = 30;

function load(): Notif[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.slice(0, MAX) : []; } catch { return []; }
}
function save(list: Notif[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* non mémorisé */ } }

// --- Liste liée au compte ---
const SYNC_KEY = "market-empire-notifs-sync";
const signedIn = () => useAuth.getState().status === "in" ? useAuth.getState().user?.id ?? null : null;
const remote = (name: string, args: Record<string, unknown> = {}) => { if (signedIn()) void rpc(name, args).catch(() => {}); };
const upload = (n: Notif) => remote("notifs_add", { p_id: n.id, p_at: n.at, p_title: n.title, p_body: n.text, p_href: n.href, p_tone: n.tone });
function lastSync(uid: string): number {
  try { const v = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "{}"); return typeof v[uid] === "number" ? v[uid] : 0; } catch { return 0; }
}
function setLastSync(uid: string, at: number) { try { localStorage.setItem(SYNC_KEY, JSON.stringify({ [uid]: at })); } catch { /* non mémorisé */ } }
interface Row { id: string; at: string; title: string; body: string; href: string; tone: Notif["tone"]; read: boolean }

/** Fusionne avec la liste du compte : le serveur fait foi (lues et effacées sur un autre appareil) ; les notifications
 *  créées ici depuis la dernière fusion (hors ligne, avant la connexion) lui sont envoyées. */
let syncing = false, syncedAt = 0;
export async function syncNotifs(force = false) {
  const uid = signedIn();
  if (!uid || syncing || (!force && Date.now() - syncedAt < 30_000)) return;
  syncing = true;
  try {
    const rows = await rpc<Row[]>("notifs_list", {});
    const since = lastSync(uid) || Date.now() - 86_400_000, local = useNotifs.getState().list;
    const server = new Map(rows.map((r) => [r.id, r]));
    const fresh = local.filter((n) => !server.has(n.id) && n.at > since);
    for (const n of fresh) upload(n);
    const list = [...rows.map((r): Notif => ({ id: r.id, at: Date.parse(r.at), title: r.title, text: r.body, href: r.href, tone: r.tone, read: r.read || !!local.find((n) => n.id === r.id)?.read })), ...fresh]
      .sort((a, b) => b.at - a.at).slice(0, MAX);
    if (list.some((n) => n.read && !server.get(n.id)?.read && server.has(n.id))) remote("notifs_read");
    useNotifs.setState({ list }); save(list);
    syncedAt = Date.now(); setLastSync(uid, syncedAt);
  } catch { /* hors ligne : on garde la copie de l'appareil */ }
  syncing = false;
}

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
    set({ list }); save(list); upload(list[0]);
    // Le message s'affiche sans passer par le son d'erreur : une notification a sa propre sonnerie
    useGame.getState().notify(n.title, "ok");
    play(n.id.startsWith("rank-") ? "rank" : "notify");
    // Onglet en arrière-plan : notification du navigateur si elle est autorisée
    if (get().system && typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(`Market Empire · ${n.title}`, { body: n.text, tag: n.id }); } catch { /* non pris en charge ici */ }
    }
  },
  readAll: () => {
    if (get().list.every((n) => n.read)) return;
    const list = get().list.map((n) => ({ ...n, read: true })); set({ list }); save(list); remote("notifs_read");
  },
  clear: () => { set({ list: [] }); save([]); remote("notifs_clear"); },
  enableSystem: async () => {
    if (typeof Notification === "undefined") return false;
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    set({ system: p === "granted" });
    return p === "granted";
  },
}));

let started = false;
/** Repart d'une autre partie sans rien signaler (voir rebaseNotifs). */
let rebase: ((game: E.GameState) => void) | null = null;
/** La partie va être remplacée par celle du serveur (jouée sur un autre appareil) : ce qui y est déjà arrivé
 *  (rang, objectifs, nouveautés) a été signalé là-bas. On repart d'elle sans le re-signaler ici. */
export function rebaseNotifs(game: E.GameState) { rebase?.(game); }

/** Surveille la partie et les cours, et crée les notifications. À appeler une fois la partie chargée. */
export function startNotifs() {
  if (started || typeof window === "undefined") return;
  started = true;
  useNotifs.setState({ list: load(), system: typeof Notification !== "undefined" && Notification.permission === "granted" });
  // Notifications quand le jeu est fermé : l'abonnement de l'appareil suit le compte connecté
  void initPush();
  useAuth.subscribe((s, p) => {
    if (s.user?.id !== p.user?.id) void initPush();
    if (s.status === "in" && (p.status !== "in" || s.user?.id !== p.user?.id)) void syncNotifs(true);
  });
  void syncNotifs(true);
  // Retour sur l'appli, et toutes les 2 minutes quand elle est à l'écran : la liste suit les autres appareils
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void syncNotifs(); });
  setInterval(() => { if (!document.hidden) void syncNotifs(); }, 120_000);
  const { push } = useNotifs.getState();
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

  // État de départ : on ne signale que ce qui CHANGE ensuite (pas tout ce qui est déjà vrai à l'ouverture)
  let g = useGame.getState().game, city = E.computeCity(g);
  let rank = city.rank, wearHigh = city.wear >= 0.5, asleep = (g.branches?.length ?? 0) - city.branches, eventUntil = g.event?.until ?? 0;
  const known = new Set(E.goalStatuses(g, city).filter((s) => s.done).map((s) => s.goal.id));
  rebase = (game) => {
    g = game; city = E.computeCity(g); rank = city.rank; wearHigh = city.wear >= 0.5; asleep = (g.branches?.length ?? 0) - city.branches;
    known.clear(); for (const st of E.goalStatuses(g, city)) if (st.done) known.add(st.goal.id);
    eventUntil = g.event?.until ?? 0;
  };

  useGame.subscribe((s, prev) => {
    if (s.game !== prev.game) {
      // Nouvelle partie : on repart de zéro sans rien signaler
      if (s.game.createdAt !== g.createdAt) { rebase!(s.game); return; }
      g = s.game; city = E.computeCity(g);
      // Mission du jour réussie : récompense à encaisser
      if (g.daily) for (const st of missionStatuses(g, city)) {
        if (st.done && !st.mission.claimed) push({ id: `mission-${g.daily.date}-${st.index}`, tone: "good", title: "Mission du jour réussie", text: `${missionText(st.mission)} : ${fmt(st.mission.reward)} €`, href: "/" });
      }
      for (const st of E.goalStatuses(g, city)) {
        if (!st.done || known.has(st.goal.id)) continue;
        known.add(st.goal.id);
        if (!st.claimed) push({ id: `goal-${g.createdAt}-${st.goal.id}`, tone: "good", title: "Subvention à encaisser", text: `${st.goal.label} : ${fmt(st.goal.reward)} €`, href: "/ville" });
      }
      if (city.rank > rank) push({ id: `rank-${g.createdAt}-${city.rank}`, tone: "good", title: `Nouveau rang : ${CITY_RANKS[city.rank].name}`, text: `${fmt(g.population)} habitants`, href: "/ville" });
      for (const f of FEATURES) if (f.rank > rank && f.rank <= city.rank) push({ id: `feature-${g.createdAt}-${f.id}`, tone: "info", title: `Nouveau : ${f.label}`, text: `Débloqué au rang ${CITY_RANKS[f.rank].name}`, href: f.href });
      rank = city.rank;
      // Événement de la semaine : signalé quand il commence
      if (g.event && g.event.until !== eventUntil && city.event) push({ id: `event-${g.createdAt}-${g.event.until}`, tone: city.event.kind === "bonus" ? "good" : "bad", title: city.event.name, text: `${city.event.effect}, ${city.event.daysLeft} j`, href: "/ville" });
      eventUntil = g.event?.until ?? eventUntil;
      if (city.wear >= 0.5 && !wearHigh) push({ id: `wear-${g.createdAt}-${g.day}`, tone: "bad", title: "Ville vétuste", text: `Vétusté ${Math.round(city.wear * 100)} % : entretien en hausse`, href: "/ville" });
      wearHigh = city.wear >= 0.5;
      const nowAsleep = (g.branches?.length ?? 0) - city.branches;
      if (nowAsleep > asleep) push({ id: `branch-${g.createdAt}-${g.day}-${nowAsleep}`, tone: "info", title: "Site en sommeil", text: "Participation de départ vendue", href: "/ville" });
      asleep = nowAsleep;
    }
    if (s.quotes !== prev.quotes) {
      // Forte variation d'un actif détenu : une fois par actif et par jour réel
      const day = new Date().toISOString().slice(0, 10);
      for (const symbol of Object.keys(s.game.holdings)) {
        const q = s.quotes[symbol];
        if (!q || Math.abs(q.change) < BIG_MOVE) continue;
        const pct = `${q.change > 0 ? "+" : "−"}${(Math.abs(q.change) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
        push({ id: `move-${symbol}-${day}`, tone: q.change > 0 ? "good" : "bad", title: `${ASSET_BY_SYMBOL[symbol]?.name ?? symbol} : ${pct} sur un jour`, text: "Forte variation dans votre portefeuille", href: "/portefeuille" });
      }
    }
  });
}
