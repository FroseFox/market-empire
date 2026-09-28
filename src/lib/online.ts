"use client";
// Partie en ligne sur le site publié (compte Discord + Supabase).
// Économe en données :
// - une seule ligne par joueur pour la sauvegarde, écrasée (pas d'historique côté serveur) ;
// - sauvegarde allégée (120 derniers jours, 50 dernières opérations) ;
// - au plus une écriture par minute, seulement si la partie a changé,
//   + une dernière écriture quand on quitte la page ;
// - sauvegarde et chiffres du classement envoyés en un seul appel.
import { create } from "zustand";
import * as E from "@/lib/game/engine";
import { useGame } from "@/store/game";
import { restAsUser, rpc, useAuth } from "@/lib/auth";
import { STATIC_MODE } from "@/lib/market/client";
import { countryPreference } from "@/lib/world/countries";

const LINK_KEY = "market-empire-linked";
const MIN_GAP = 60_000;
const DEBOUNCE = 15_000;

/** Pays (territoire) du joueur connecté. */
export const useOnline = create<{ country: string | null }>(() => ({ country: null }));

const compact = (g: E.GameState): E.GameState => ({ ...g, history: g.history.slice(-120), transactions: g.transactions.slice(0, 50) });

function figures() {
  const s = useGame.getState();
  const prices = Object.fromEntries(Object.entries(s.quotes).map(([k, q]) => [k, q.price]));
  const city = E.computeCity(s.game);
  const pv = E.portfolioValue(s.game.holdings, prices);
  const cost = E.portfolioCost(s.game.holdings);
  return {
    p_city: s.game.cityName,
    p_net_worth: Math.max(0, Math.round(s.game.cash + pv + city.assetValue)),
    p_population: Math.max(0, Math.round(s.game.population)),
    p_perf: cost > 0 ? Math.round((pv / cost - 1) * 10_000) / 10_000 : 0,
    p_day: Math.max(1, s.game.day),
  };
}

let active: string | null = null;
let unsubGame: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWrite = 0, dirty = false, writing = false;
const setCloud = (c: "local" | "syncing" | "saved" | "error") => useGame.setState({ cloud: c });

async function flush(keepalive = false) {
  if (!active || writing || !dirty) return;
  writing = true;
  dirty = false;
  const s = useGame.getState();
  try {
    const ok = await rpc<boolean>("save_game", { p_data: compact(s.game), p_saved_at: s.savedAt || Date.now(), ...figures() }, { keepalive });
    if (ok === false) { dirty = true; schedule(); } // le serveur limite à une écriture toutes les 20 s
    else { lastWrite = Date.now(); setCloud("saved"); }
  } catch {
    dirty = true;
    setCloud("error");
  }
  writing = false;
}

function schedule() {
  if (timer || !active) return;
  const wait = Math.max(DEBOUNCE, lastWrite + MIN_GAP - Date.now());
  timer = setTimeout(() => { timer = null; flush(); }, wait);
}

function setPlayerName(name: string) {
  const g = useGame.getState().game;
  if (name && g.playerName !== name) useGame.setState({ game: { ...g, playerName: name } });
}

async function connect(uid: string, name: string) {
  active = uid;
  setCloud("syncing");
  try {
    const joined = await rpc<{ country: string | null }[]>("join_world", { p_countries: countryPreference(uid) });
    useOnline.setState({ country: joined?.[0]?.country ?? null });

    // La sauvegarde la plus récente gagne. Sur un appareil jamais lié à ce compte,
    // la sauvegarde en ligne l'emporte (on n'écrase pas une vraie partie par une partie neuve).
    const rows = await restAsUser<{ data: E.GameState; saved_at: number }[]>("saves?select=data,saved_at&limit=1");
    let linked = false;
    try { linked = localStorage.getItem(LINK_KEY) === uid; } catch { /* stockage indisponible */ }
    const remote = rows?.[0];
    const local = useGame.getState();
    if (remote?.data && (!linked || Number(remote.saved_at) > local.savedAt)) {
      useGame.setState({ game: E.normalize(remote.data), savedAt: Number(remote.saved_at) });
      useGame.getState().sync();
      setCloud("saved");
    } else {
      dirty = true;
      await flush();
    }
    try { localStorage.setItem(LINK_KEY, uid); } catch { /* idem */ }
    setPlayerName(name);
  } catch {
    setCloud("error");
  }
  unsubGame?.();
  unsubGame = useGame.subscribe((s, p) => {
    if (s.game === p.game || !active) return;
    dirty = true;
    if (useGame.getState().cloud === "saved") setCloud("syncing");
    schedule();
  });
}

function disconnect() {
  active = null;
  unsubGame?.(); unsubGame = null;
  if (timer) { clearTimeout(timer); timer = null; }
  dirty = false;
  useOnline.setState({ country: null });
  setCloud("local");
}

let started = false;
export function startOnline() {
  if (started || STATIC_MODE) return;
  started = true;
  const apply = (s: ReturnType<typeof useAuth.getState>) => {
    if (s.status === "in" && s.user && s.user.id !== active) connect(s.user.id, s.user.name);
    if (s.status === "out" && active) disconnect();
  };
  apply(useAuth.getState());
  useAuth.subscribe(apply);
  // Dernière sauvegarde en quittant ou en changeant d'onglet
  const leave = () => { if (dirty && Date.now() - lastWrite > 20_000) flush(true); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) leave(); });
  window.addEventListener("pagehide", leave);
}
