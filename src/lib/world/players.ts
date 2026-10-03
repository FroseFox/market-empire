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
import { pack } from "@/lib/game/pack";
import { BUILDING_BY_ID } from "@/lib/game/config";
import { isBuildable, MAX_MAP_SIZE, type Plot } from "@/lib/game/layout";
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
  /** Plan de la ville, quand il est déjà connu (page claude.ai) ; sinon il est lu à la visite. */
  city?: unknown;
}

/** Plan de ville publié → emplacements sûrs à dessiner (bâtiments connus, carreaux valides, sans doublon). */
export function plotsFromCity(city: unknown): Plot[] {
  if (!city || typeof city !== "object") return [];
  const seen = new Set<string>(), out: Plot[] = [];
  for (const [id, xy] of Object.entries(city as Record<string, unknown>)) {
    if (!BUILDING_BY_ID[id] || !Array.isArray(xy)) continue;
    for (let i = 0; i + 1 < xy.length && out.length < 900; i += 2) {
      const x = Number(xy[i]), y = Number(xy[i + 1]), k = `${x},${y}`;
      if (!isBuildable(x, y, MAX_MAP_SIZE) || seen.has(k)) continue;
      seen.add(k);
      out.push({ id, x, y });
    }
  }
  return out;
}

/** Plan de la ville d'un joueur, pour la visiter. `null` = pas encore publié ou serveur injoignable. */
export async function fetchCity(p: PublicPlayer): Promise<Plot[] | null> {
  let city = p.city;
  if (!STATIC_MODE) {
    const rows = await rest<{ city: unknown }[]>(`players?select=city&id=eq.${encodeURIComponent(p.id)}&limit=1`, 60_000);
    city = rows?.[0]?.city;
  }
  const plots = plotsFromCity(city);
  return plots.length ? plots : null;
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
    country: s.game.country && PLAYABLE[s.game.country] ? s.game.country : country,
    city: pack(s.game).pl,
  };
}

type Row = { id: string; name: string; avatar: string | null; country: string | null; city_name: string; net_worth: number; population: number; perf: number; day: number; updated_at: string };

/** Site publié : classement lu dans Supabase (mis en cache 5 min, seulement quand la page Monde est ouverte). */
async function loadOnline(fresh = false) {
  // « ranking » = classement sans les sauvegardes signalées comme impossibles ; tant que la vue n'existe pas, on lit la table
  const query = "select=id,name,avatar,country,city_name,net_worth,population,perf,day,updated_at&order=net_worth.desc&limit=300";
  const rows = (await rest<Row[]>(`ranking?${query}`, fresh ? 0 : undefined)) ?? (await rest<Row[]>(`players?${query}`, fresh ? 0 : undefined));
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
        city: x.city,
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
  // Le pays donne la spécialité de la ville : la partie doit le connaître
  { const g = useGame.getState().game; if (!g.country) useGame.setState({ game: { ...g, country } }); }

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

/** Après un déménagement : relit tout de suite le classement (site publié). */
export function refreshWorld() { if (!STATIC_MODE) { lastLoad = Date.now(); loadOnline(true); } }

export function useWorld(): State {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); start(); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

/** Lance la publication du profil dès l'ouverture du jeu (page claude.ai). */
export function startWorldSync() { if (STATIC_MODE) start(); }
