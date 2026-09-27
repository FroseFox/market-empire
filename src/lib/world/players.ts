"use client";
// Profils publics des joueurs : ce que les autres voient sur la carte et au classement.
// Chaque joueur n'écrit que son propre document players/<id> (règle d'accès de la page).
// On ne stocke jamais de nom de personne : il est résolu à l'affichage.
import { useSyncExternalStore } from "react";
import { STATIC_MODE } from "@/lib/market/client";
import { getRuntime } from "@/lib/runtime";
import { useGame } from "@/store/game";
import * as E from "@/lib/game/engine";
import { pickRegion } from "./map";

export interface PublicPlayer {
  id: string;
  cityName: string;
  netWorth: number;
  population: number;
  perf: number;        // performance du portefeuille depuis l'achat (fraction)
  day: number;
  region: number;
  updatedAt: number;
  name: string;        // résolu à l'affichage, jamais stocké
  color: string;
  isMe: boolean;
}

type State = { status: "loading" | "ready" | "offline"; players: PublicPlayer[]; me: string | null };
let state: State = { status: STATIC_MODE ? "loading" : "offline", players: [], me: null };
const listeners = new Set<() => void>();
const emit = (s: State) => { state = s; listeners.forEach((l) => l()); };
let started = false;

function profileFromGame(region: number) {
  const s = useGame.getState();
  const prices = Object.fromEntries(Object.entries(s.quotes).map(([k, q]) => [k, q.price]));
  const city = E.computeCity(s.game);
  const pv = E.portfolioValue(s.game.holdings, prices);
  const cost = E.portfolioCost(s.game.holdings);
  return {
    cityName: s.game.cityName,
    netWorth: Math.round(s.game.cash + pv + city.assetValue),
    population: Math.round(s.game.population),
    perf: cost > 0 ? Math.round((pv / cost - 1) * 10_000) / 10_000 : 0,
    day: s.game.day,
    region,
  };
}

async function start() {
  if (started || !STATIC_MODE) return;
  started = true;
  const rt = await getRuntime();
  if (!rt) { emit({ status: "offline", players: [], me: null }); return; }
  const { db, user, uid } = rt;
  let raw: Omit<PublicPlayer, "name" | "color" | "isMe">[] = [];

  const resolve = async () => {
    const ids = raw.map((p) => p.id);
    const profiles = ids.length ? await user.profiles(ids) : {};
    emit({
      status: "ready", me: uid,
      players: raw.map((p) => ({ ...p, name: profiles[p.id]?.name || "", color: profiles[p.id]?.color || "#94A3B8", isMe: p.id === uid })),
    });
  };

  db.collection("players").limit(500).onSnapshot((snap) => {
    raw = snap.docs.map((d) => {
      const x = d.data() ?? {};
      return {
        id: d.id,
        cityName: String(x.cityName ?? "Ville sans nom").slice(0, 40),
        netWorth: Number(x.netWorth) || 0,
        population: Number(x.population) || 0,
        perf: Number(x.perf) || 0,
        day: Number(x.day) || 1,
        region: Number.isInteger(x.region) ? (x.region as number) : -1,
        updatedAt: Number(x.updatedAt) || 0,
      };
    });
    resolve();
  }, () => emit({ ...state, status: "offline" }));

  // Publication de mon profil : à l'arrivée, puis quand la partie change (regroupé)
  const ref = db.doc(`players/${uid}`);
  let region = -1;
  try {
    const mine = await ref.get();
    const r = mine.exists ? mine.data()?.region : undefined;
    if (Number.isInteger(r)) region = r as number;
  } catch { /* on réessaiera */ }
  if (region < 0) {
    const all = await db.collection("players").get().catch(() => ({ docs: [] }));
    const taken = all.docs.map((d) => d.data()?.region).filter((v): v is number => Number.isInteger(v));
    region = pickRegion(uid, taken) ?? 0;
  }

  let last = "", writing = false, timer: ReturnType<typeof setTimeout> | null = null;
  const publish = async () => {
    if (writing) { schedule(); return; }
    const body = profileFromGame(region);
    const key = JSON.stringify(body);
    if (key === last) return;
    writing = true;
    try { await ref.set({ ...body, updatedAt: Date.now() }); last = key; } catch { /* lecture seule ou hors ligne */ }
    writing = false;
  };
  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(publish, 8000); };
  publish();
  useGame.subscribe((s, p) => { if (s.game !== p.game) schedule(); });
}

export function useWorld(): State {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); start(); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

/** Lance la publication du profil dès l'ouverture du jeu (pas seulement sur la page Monde). */
export function startWorldSync() { start(); }
