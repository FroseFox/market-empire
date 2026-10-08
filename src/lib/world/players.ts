"use client";
// Profils publics des joueurs : ce que les autres voient sur la carte et au classement.
// - Page claude.ai : chaque joueur n'écrit que son document players/<id> ; le nom est résolu à l'affichage.
// - Site publié : table Supabase « players » (lecture publique), remplie par les joueurs connectés avec Discord.
import { useSyncExternalStore } from "react";
import { rest, STATIC_MODE } from "@/lib/market/client";
import { useAuth } from "@/lib/auth";
import { followServerCountry } from "@/lib/online";
import { getRuntime } from "@/lib/runtime";
import { useGame } from "@/store/game";
import * as E from "@/lib/game/engine";
import { pack } from "@/lib/game/pack";
import { plotsFromCity, type Plot } from "@/lib/game/layout";
export { plotsFromCity };
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
  /** Faux : sauvegarde signalée comme impossible. Le joueur garde son pays sur la carte, mais sort du classement. */
  ranked?: boolean;
  /** Bourse des villes : flux net publié, parts mises en vente et parts déjà vendues (absents tant que le serveur ne les connaît pas). */
  income?: number;
  shareFloat?: number;
  shareSold?: number;
  /** Alliance de la ville (identifiant) et ce qu'elle a versé à sa caisse commune. */
  alliance?: string | null;
  allianceGift?: number;
  /** Plan de la ville, quand il est déjà connu (page claude.ai) ; sinon il est lu à la visite. */
  city?: unknown;
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
let started = false, watching = false;

function profileFromGame(country: string) {
  const s = useGame.getState();
  const prices = Object.fromEntries(Object.entries(s.quotes).map(([k, q]) => [k, q.price]));
  const city = E.computeCity(s.game);
  const pv = E.portfolioValue(s.game.holdings, prices);
  const cost = E.portfolioCost(s.game.holdings);
  return {
    cityName: s.game.cityName,
    netWorth: Math.round(s.game.cash + pv + E.sharesValue(s.game) + city.assetValue),
    population: Math.round(s.game.population),
    perf: cost > 0 ? Math.round((pv / cost - 1) * 10_000) / 10_000 : 0,
    day: s.game.day,
    country: s.game.country && PLAYABLE[s.game.country] ? s.game.country : country,
    city: pack(s.game).pl,
  };
}

type Row = { id: string; name: string; avatar: string | null; country: string | null; city_name: string; net_worth: number; population: number; perf: number; day: number; updated_at: string; flagged?: boolean; income?: number; share_float?: number; share_sold?: number; alliance?: string | null; alliance_gift?: number; tester?: boolean };

let lastLoad = 0;
/** Délai minimal entre deux lectures du classement, et rythme de relecture tant que la page Monde reste ouverte. */
const RELOAD_MIN = 30_000, RELOAD_EVERY = 120_000;
/** Site publié : classement lu dans Supabase, seulement quand la page Monde est ouverte. Toujours relu sur le serveur :
 *  une liste gardée en mémoire montrait des joueurs dans leur ancien pays plusieurs minutes après un déménagement. */
async function loadOnline(fresh = false) {
  // La carte montre TOUS les territoires occupés : un joueur signalé (sauvegarde impossible) garde son pays,
  // il sort seulement du classement. On lit donc la table complète avec son signalement, en une seule requête.
  // Secours : la vue « ranking » (sans les joueurs signalés), puis la table sans la colonne de signalement.
  const cols = "id,name,avatar,country,city_name,net_worth,population,perf,day,updated_at";
  const tail = "&order=net_worth.desc&limit=300", ttl = fresh ? 0 : undefined;
  const rows = (await rest<Row[]>(`players?select=${cols},flagged,income,share_float,share_sold,alliance,alliance_gift,tester${tail}`, ttl))
    ?? (await rest<Row[]>(`players?select=${cols},flagged,income,share_float,share_sold,alliance,alliance_gift${tail}`, ttl))
    ?? (await rest<Row[]>(`players?select=${cols},flagged,income,share_float,share_sold${tail}`, ttl))
    ?? (await rest<Row[]>(`players?select=${cols},flagged${tail}`, ttl))
    ?? (await rest<Row[]>(`ranking?select=${cols}${tail}`, ttl))
    ?? (await rest<Row[]>(`players?select=${cols}${tail}`, ttl));
  // Échec : on réessaiera à la prochaine ouverture de la page, sans attendre 5 minutes
  if (!rows) { lastLoad = 0; emit({ status: "offline", players: [], me: null }); return; }
  const me = useAuth.getState().user?.id ?? null;
  const mine = me ? rows.find((r) => r.id === me) : undefined;
  if (me && mine && fresh) followServerCountry(me, mine.country);
  emit({
    status: "ready", me,
    players: rows.filter((r) => r.country && PLAYABLE[r.country]).map((r) => ({
      id: r.id, cityName: r.city_name, netWorth: Number(r.net_worth) || 0, population: r.population, perf: Number(r.perf) || 0,
      day: r.day, country: r.country!, updatedAt: Date.parse(r.updated_at) || 0, name: r.name, avatar: r.avatar,
      color: r.id === me ? "#2563EB" : "#64748B", isMe: r.id === me, ranked: !r.flagged && !r.tester, // les comptes de test restent sur la carte mais sortent du classement
      income: Number(r.income) || 0, shareFloat: Number(r.share_float) || 0, shareSold: Number(r.share_sold) || 0,
      alliance: r.alliance ?? null, allianceGift: Number(r.alliance_gift) || 0,
    })),
  });
}

async function start() {
  // Site publié : relu à chaque ouverture de la page Monde (au plus toutes les 30 secondes), puis régulièrement tant
  // qu'elle reste ouverte, au retour sur l'onglet, et dès qu'on change de compte
  if (!STATIC_MODE) {
    if (Date.now() - lastLoad > RELOAD_MIN) refreshWorld();
    if (!watching) {
      watching = true;
      const again = () => { if (listeners.size && !document.hidden && Date.now() - lastLoad > RELOAD_MIN) refreshWorld(); };
      setInterval(() => { if (Date.now() - lastLoad >= RELOAD_EVERY) again(); }, 15_000);
      document.addEventListener("visibilitychange", again);
      let who = useAuth.getState().user?.id ?? null;
      useAuth.subscribe((s) => { const id = s.user?.id ?? null; if (id !== who) { who = id; if (listeners.size) refreshWorld(); else lastLoad = 0; } });
    }
    return;
  }
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
