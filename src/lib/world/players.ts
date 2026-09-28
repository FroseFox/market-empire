"use client";
// Profils publics des joueurs : ce que les autres voient sur la carte et au classement.
// - Page claude.ai : chaque joueur n'écrit que son document players/<id> ; le nom est résolu à l'affichage.
// - Site publié : table Supabase « players » (lecture publique), remplie par les joueurs connectés avec Discord.
import { useSyncExternalStore } from "react";
import { rest, STATIC_MODE } from "@/lib/market/client";
import { useAuth } from "@/lib/auth";
import { getRuntime } from "@/lib/runtime";
import { useGame } from "@/store/game";
import * as E from "@/lib/game/engine";
import { pickCountry, PLAYABLE } from "./countries";

export interface PublicPlayer {
  id: string;
  cityName: string;
  netWorth: number;
  population: number;
  perf: number;        // performance du portefeuille depuis l'achat (fraction)
  day: number;
  country: string;     // code ISO numérique du pays (territoire)
  updatedAt: number;
  name: string;        // page claude.ai : résolu à l'affichage ; site : pseudo Discord
  avatar?: string | null;
  color: string;
  isMe: boolean;
}

type State = { status: "loading" | "ready" | "offline"; players: PublicPlayer[]; me: string | null };
let state: State = { status: "loading", players: [], me: null };
const listeners = new Set<() => void>();
const emit = (s: State) => { state = s; listeners.forEach((l) => l()); };
let started = false;

function profileFromGame(country: string) {
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
    country,
  };
}

type Row = { id: string; name: string; avatar: string | null; country: string | null; city_name: string; net_worth: number; population: number; perf: number; day: number; updated_at: string };

/** Site publié : classement lu dans Supabase (mis en cache 5 min, seulement quand la page Monde est ouverte). */
async function loadOnline() {
  const rows = await rest<Row[]>("players?select=id,name,avatar,country,city_name,net_worth,population,perf,day,updated_at&order=net_worth.desc&limit=300");
  if (!rows) { emit({ status: "offline", players: [], me: null }); return; }
  const me = useAuth.getState().user?.id ?? null;
  emit({
    status: "ready", me,
    players: rows.filter((r) => r.country && PLAYABLE[r.country]).map((r) => ({
      id: r.id, cityName: r.city_name, netWorth: Number(r.net_worth) || 0, population: r.population, perf: Number(r.perf) || 0,
      day: r.day, country: r.country!, updatedAt: Date.parse(r.updated_at) || 0, name: r.name, avatar: r.avatar,
      color: r.id === me ? "#2563EB" : "#64748B", isMe: r.id === me,
    })),
  });
}

let lastLoad = 0;
async function start() {
  // Site publié : au plus une lecture toutes les 5 minutes (la liste est aussi mise en cache)
  if (!STATIC_MODE) { if (Date.now() - lastLoad > 5 * 60_000) { lastLoad = Date.now(); loadOnline(); } return; }
  if (started) return;
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
        country: typeof x.country === "string" && PLAYABLE[x.country] ? x.country : "",
        updatedAt: Number(x.updatedAt) || 0,
      };
    });
    resolve();
  }, () => emit({ ...state, status: "offline" }));

  // Publication de mon profil : à l'arrivée, puis quand la partie change (regroupé)
  const ref = db.doc(`players/${uid}`);
  let country = "";
  try {
    const mine = await ref.get();
    const c = mine.exists ? mine.data()?.country : undefined;
    if (typeof c === "string" && PLAYABLE[c]) country = c;
  } catch { /* on réessaiera */ }
  if (!country) {
    const all = await db.collection("players").get().catch(() => ({ docs: [] }));
    const taken = all.docs.map((d) => d.data()?.country).filter((v): v is string => typeof v === "string");
    country = pickCountry(uid, taken) ?? "250";
  }

  let last = "", writing = false, timer: ReturnType<typeof setTimeout> | null = null;
  const publish = async () => {
    if (writing) { schedule(); return; }
    const body = profileFromGame(country);
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

/** Lance la publication du profil dès l'ouverture du jeu (page claude.ai). */
export function startWorldSync() { if (STATIC_MODE) start(); }
