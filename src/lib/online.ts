"use client";
// Partie en ligne sur le site publié (compte Discord + Supabase).
// Économe en données :
// - une seule ligne par joueur pour la sauvegarde, écrasée (pas d'historique côté serveur) ;
// - sauvegarde au format compact (voir lib/game/pack.ts) ;
// - au plus une écriture toutes les 5 minutes, seulement si le contenu a vraiment changé,
//   + une dernière écriture quand on quitte la page ;
// - à l'ouverture, on ne télécharge la sauvegarde que si elle a changé depuis la dernière synchronisation de l'appareil ;
// - chaque écriture dit au serveur sur quelle sauvegarde elle repose : si un autre appareil a enregistré entre-temps,
//   le serveur refuse (« conflit ») et c'est sa partie qui est reprise, jamais écrasée ;
// - à chaque retour sur l'onglet, on relit seulement la date de la sauvegarde (quelques octets) ;
// - sauvegarde et chiffres du classement envoyés en un seul appel.
import { create } from "zustand";
import * as E from "@/lib/game/engine";
import { pack, unpack } from "@/lib/game/pack";
import { compactCity } from "@/lib/game/layout";
import { useGame } from "@/store/game";
import { restAsUser, rpc, useAuth } from "@/lib/auth";
import { STATIC_MODE } from "@/lib/market/client";
import { countryPreference } from "@/lib/world/countries";
import { openingMove } from "@/lib/syncRule";
import { now, setServerTime } from "@/lib/clock";
import { PSEUDO_ERRORS, pseudoProblem, tidyPseudo } from "@/lib/pseudo";
import { TERMS_VERSION, acceptTerms, termsAccepted } from "@/lib/legal";
import { rebaseNotifs } from "@/lib/notifs";
import { beforePause, tabPaused } from "@/lib/tabLock";

const LINK_KEY = "market-empire-linked";
const SYNC_KEY = "market-empire-synced";
export const MIN_GAP = 5 * 60_000;
const DEBOUNCE = 30_000;
/** Écart minimal entre deux écritures accepté par le serveur (save_game). */
const SERVER_GAP = 10_000;
/** Après une action (construction, achat, encaissement…), on enregistre au bout de quelques secondes : plus d'action
 *  perdue parce qu'on a changé d'appareil juste après. Le reste du temps (les jours qui passent), toutes les 5 minutes. */
const URGENT_DELAY = 3_000;
let urgent = false, timerAt = 0;
/** Cet appareil a des actions pas encore enregistrées en ligne (gardé sur l'appareil : survit à la fermeture et au hors-ligne). */
const UNSYNCED_KEY = "market-empire-unsynced";
const markUnsynced = (uid: string | null) => { try { if (uid) localStorage.setItem(UNSYNCED_KEY, uid); else localStorage.removeItem(UNSYNCED_KEY); } catch { /* stockage indisponible */ } };
const unsyncedFor = (uid: string) => { try { return localStorage.getItem(UNSYNCED_KEY) === uid; } catch { return false; } };

/** Où en est l'ouverture de la partie en ligne, une fois connecté avec Discord :
 *  - connecting : lecture du compte ;
 *  - new        : première connexion, le joueur doit créer son compte (nom de sa ville) ;
 *  - ready      : la partie est chargée, on peut jouer ;
 *  - error      : le serveur n'a pas répondu. */
export type OnlinePhase = "idle" | "connecting" | "new" | "ready" | "error";
/** Pays (territoire) du joueur connecté, et étape d'ouverture du compte. */
/** `tester` = compte de test désigné dans la base : il peut activer le mode test (Ville › Options). */
/** `name` : pseudo public du joueur, tel que le serveur le connaît (`null` tant qu'il n'a pas été lu). */
/** `terms` : version des conditions d'utilisation acceptée par ce compte (sur n'importe quel appareil) ;
 *  `undefined` tant qu'elle n'a pas été lue, `null` si jamais acceptée ou illisible. */
export const useOnline = create<{ country: string | null; phase: OnlinePhase; tester: boolean; name: string | null; terms?: string | null }>(() => ({ country: null, phase: "idle", tester: false, name: null }));

/** Le joueur accepte les conditions : retenu sur l'appareil ET sur son compte (plus redemandé ailleurs). */
export function acceptTermsEverywhere() {
  acceptTerms();
  useOnline.setState({ terms: TERMS_VERSION });
  if (active) void rpc("accept_terms", { p_version: TERMS_VERSION }).catch(() => {});
}

function figures() {
  const s = useGame.getState();
  const prices = Object.fromEntries(Object.entries(s.quotes).map(([k, q]) => [k, q.price]));
  const city = E.computeCity(s.game);
  const pv = E.portfolioValue(s.game.holdings, prices);
  const cost = E.portfolioCost(s.game.holdings);
  return {
    p_city: s.game.cityName,
    p_net_worth: Math.max(0, Math.round(s.game.cash + pv + E.sharesValue(s.game) + city.assetValue)),
    p_population: Math.max(0, Math.round(s.game.population)),
    p_perf: cost > 0 ? Math.round((pv / cost - 1) * 10_000) / 10_000 : 0,
    p_day: Math.max(1, s.game.day),
  };
}

let active: string | null = null;
let unsubGame: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWrite = 0, dirty = false, writing = false;
/** Date de la sauvegarde en ligne sur laquelle repose la partie de CET onglet (lue ou écrite par lui).
 *  Gardée en mémoire et non sur l'appareil : deux onglets partagent le stockage de l'appareil, pas cette valeur. */
let base: number | null = null;
/** Dernier contenu envoyé : on n'écrit pas deux fois la même chose. */
let lastSent = "";
/** Dernier plan de ville publié (ce que les autres joueurs voient en visitant). */
let lastCity = "";

/** Publie le plan de la ville, seulement s'il a changé. Sans effet si le serveur ne propose pas encore la fonction. */
async function publishCity(full: Record<string, number[]>) {
  // Format compact : une grande ville (48 × 48) dépassait la limite de 16 Ko du serveur et n'était plus publiée
  const pl = compactCity(full);
  const key = JSON.stringify(pl);
  if (key === lastCity) return;
  const before = lastCity;
  lastCity = key; // noté tout de suite : deux appels rapprochés ne publient qu'une fois
  try { if (!(await rpc<boolean>("publish_city", { p_city: pl })) && lastCity === key) lastCity = before; }
  catch { if (lastCity === key) lastCity = before; /* visite indisponible : la partie n'en dépend pas */ }
}
const setCloud = (c: "local" | "syncing" | "saved" | "error") => useGame.setState({ cloud: c });

// ─── Plusieurs appareils sur le même compte ───
// Chaque appareil retient la date de la sauvegarde en ligne avec laquelle il est à jour (celle qu'il a lue ou écrite).
// Si la date en ligne n'est plus celle-là, un autre appareil a joué depuis : sa partie fait foi.
// On ne compare jamais les horloges des appareils, ni la date locale (elle avance toute seule à chaque jour de ville).

/** Date de la sauvegarde en ligne avec laquelle cet appareil est à jour, ou `null` s'il ne l'a jamais été. */
function syncedAt(uid: string): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null") as { uid?: string; at?: number } | null;
    return v && v.uid === uid && typeof v.at === "number" ? v.at : null;
  } catch { return null; }
}
function setSynced(uid: string, at: number) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ uid, at })); } catch { /* stockage indisponible */ }
}

/** Date de la sauvegarde en ligne : `null` s'il n'y en a pas, `undefined` si le serveur n'a pas répondu. */
async function serverAt(): Promise<number | null | undefined> {
  const meta = await restAsUser<{ saved_at: number }[]>("saves?select=saved_at&limit=1");
  if (!meta) return undefined;
  return meta[0] ? Number(meta[0].saved_at) : null;
}

/** Reprend la sauvegarde en ligne : elle remplace la partie de l'appareil. */
async function pull(uid: string) {
  const rows = await restAsUser<{ data: unknown; saved_at: number }[]>("saves?select=data,saved_at&limit=1");
  if (active !== uid) return;
  if (!rows?.[0]?.data) throw new Error("sauvegarde illisible");
  const at = Number(rows[0].saved_at);
  const game = E.normalize(unpack(rows[0].data));
  rebaseNotifs(game); // déjà signalé sur l'autre appareil : pas de « Nouveau rang » ni d'objectif en double ici
  useGame.setState({ game, savedAt: at });
  markUnsynced(null);
  void syncLedger(); // ce que cette partie n'avait pas encore appliqué du registre
  setSynced(uid, at);
  base = at;
  dirty = false; lastSent = "";
  useGame.getState().sync();
  setCloud("saved");
}

let lastCheck = 0;
/** Retour sur l'onglet : si un autre appareil a enregistré entre-temps, on reprend sa partie. */
async function refresh() {
  const uid = active;
  if (!uid || writing || tabPaused() || useOnline.getState().phase !== "ready" || Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now();
  const [at] = await Promise.all([serverAt().catch(() => undefined), syncClock()]);
  if (active !== uid || writing || typeof at !== "number" || at === (base ?? syncedAt(uid))) return;
  writing = true;
  try {
    await pull(uid);
    adoptCountry();
    useGame.getState().notify("Partie mise à jour depuis votre autre appareil");
  } catch { setCloud("error"); }
  writing = false;
}

/** Le serveur a refusé la sauvegarde : elle n'est pas possible depuis la dernière qu'il a acceptée
 *  (plus de jours de ville que d'heures passées, argent ou habitants apparus trop vite, mode test sur un compte ordinaire). */
export const isRefusal = (e: unknown) => e instanceof Error && / refus:/.test(e.message);
/** Le serveur a refusé la sauvegarde parce qu'un autre appareil (ou onglet) a enregistré depuis notre dernière lecture. */
const isConflict = (e: unknown) => e instanceof Error && / conflit$/.test(e.message);

/** Cale l'heure du jeu sur celle du serveur (quelques octets). Sans effet si le serveur ne répond pas. */
async function syncClock() {
  const sent = Date.now();
  const server = await rpc<number>("server_now", {}).catch(() => null);
  if (typeof server === "number") setServerTime(server, sent, Date.now());
}

async function flush(keepalive = false) {
  if (!active || writing || !dirty || tabPaused()) return;
  const uid = active;
  writing = true;
  try {
    // Plus de lecture préalable de la date : le serveur compare lui-même `p_base` à sa sauvegarde, sans course possible
    // entre deux appareils, et refuse (« conflit ») si un autre a enregistré entre-temps.
    dirty = false;
    const s = useGame.getState();
    const data = pack(s.game), fig = figures();
    const body = JSON.stringify([data, fig]);
    if (body === lastSent) { writing = false; setCloud("saved"); return; }
    const sentAt = s.savedAt || Date.now();
    const ok = await rpc<boolean>("save_game", { p_data: data, p_saved_at: sentAt, ...fig, p_base: base ?? syncedAt(uid) }, { keepalive });
    if (ok === false) { dirty = true; schedule(); } // le serveur limite à une écriture toutes les 20 s
    else {
      lastWrite = Date.now(); lastSent = body; setCloud("saved");
      // On retient la date réellement enregistrée (relue sur le serveur quand la page reste ouverte)
      const stored = keepalive ? sentAt : await serverAt().catch(() => undefined);
      if (active === uid) { base = typeof stored === "number" ? stored : sentAt; setSynced(uid, base); }
      if (active === uid && !dirty) markUnsynced(null);
      urgent = false;
      if (!keepalive) { void publishCity(data.pl); void publishOffer(); void publishIncome(); void syncShares(); void syncAlliance(); void syncLedger(); void import("@/lib/push").then((m) => m.syncReminder()).catch(() => {}); }
    }
  } catch (e) {
    if (isConflict(e) && active === uid) {
      // Un autre appareil a joué depuis : sa partie fait foi
      try {
        await pull(uid);
        adoptCountry();
        useGame.getState().notify("Partie mise à jour depuis votre autre appareil");
      } catch { dirty = true; setCloud("error"); }
    } else if (isRefusal(e) && active === uid) {
      // Partie impossible : on reprend celle du serveur, la dernière qu'il a acceptée
      try {
        await pull(uid);
        adoptCountry();
        useGame.getState().notify("Sauvegarde refusée par le serveur : votre dernière partie en ligne a été reprise", "error");
      } catch { dirty = true; setCloud("error"); }
    } else {
      dirty = true;
      setCloud("error");
    }
  }
  writing = false;
}

function schedule() {
  if (!active) return;
  const wait = urgent ? Math.max(URGENT_DELAY, lastWrite + SERVER_GAP + 500 - Date.now()) : Math.max(DEBOUNCE, lastWrite + MIN_GAP - Date.now());
  // Une action arrive alors qu'une écriture lointaine est prévue : on la rapproche
  if (timer && Date.now() + wait >= timerAt) return;
  if (timer) clearTimeout(timer);
  timerAt = Date.now() + wait;
  timer = setTimeout(() => { timer = null; flush(); }, wait);
}

function setPlayerName(name: string) {
  const g = useGame.getState().game;
  if (name && g.playerName !== name) useGame.setState({ game: { ...g, playerName: name } });
}

/** Le pays réservé côté serveur fait foi : la partie le reprend (c'est lui qui donne la spécialité de la ville). */
function adoptCountry() {
  const country = useOnline.getState().country, g = useGame.getState().game;
  if (country && g.country !== country) useGame.setState({ game: { ...g, country } });
}

/** Le classement vient d'être relu : si le serveur m'y place dans un autre pays (déménagement fait ailleurs, ou
 *  corrigé à la main dans la base), la partie le suit tout de suite, sans attendre la prochaine ouverture du jeu. */
export function followServerCountry(uid: string, country: string | null) {
  if (!country || uid !== active || useOnline.getState().phase !== "ready" || useOnline.getState().country === country) return;
  useOnline.setState({ country });
  adoptCountry();
}

/** Dernier surplus annoncé aux autres joueurs. */
let lastOffer = "";
async function publishOffer() {
  const c = E.computeCity(useGame.getState().game);
  const offer = { p_energy: Math.max(0, Math.floor(c.energy.balance)), p_food: Math.max(0, Math.floor(c.food.balance)) };
  const key = JSON.stringify(offer);
  if (key === lastOffer) return;
  const before = lastOffer;
  lastOffer = key;
  try { if (!(await rpc<boolean>("publish_offer", offer)) && lastOffer === key) lastOffer = before; }
  catch { if (lastOffer === key) lastOffer = before; /* commerce indisponible : la partie n'en dépend pas */ }
}

type ContractRow = { id: string; seller: string; buyer: string; resource: "energy" | "food"; qty: number };
/** Relit ses contrats sur le serveur et les applique à la partie. `false` si le commerce n'est pas disponible. */
export async function syncContracts(): Promise<boolean> {
  const uid = active;
  if (!uid) return false;
  const rows = await restAsUser<ContractRow[]>("contracts?select=id,seller,buyer,resource,qty&order=created_at.asc");
  if (!rows || active !== uid) return false;
  const contracts: E.Contract[] = rows.map((r) => ({ id: r.id, resource: r.resource, qty: r.qty, side: r.buyer === uid ? "buy" : "sell", partner: r.buyer === uid ? r.seller : r.buyer }));
  const g = useGame.getState().game, next = E.setContracts(g, contracts);
  if (next !== g) useGame.setState({ game: next });
  return true;
}

/** Signe un contrat d'achat. `null` = refusé (surplus déjà pris, trop de contrats). Lève une erreur si le serveur ne répond pas. */
export async function signContract(seller: string, resource: "energy" | "food", qty: number): Promise<boolean> {
  const id = await rpc<string | null>("sign_contract", { p_seller: seller, p_resource: resource, p_qty: Math.floor(qty) });
  await syncContracts();
  return !!id;
}
export async function cancelContract(id: string): Promise<boolean> {
  const ok = await rpc<boolean>("cancel_contract", { p_id: id });
  await syncContracts();
  return !!ok;
}

// ─── Bourse des villes ───
// Même principe que le commerce : le serveur tient le registre des parts, le jeu applique l'argent des deux côtés.

/** Dernier flux net publié (hors dividendes) : il sert au calcul des dividendes chez les actionnaires. */
let lastIncome = "";
async function publishIncome() {
  const key = String(Math.round(E.computeCity(useGame.getState().game).operating));
  if (key === lastIncome) return;
  const before = lastIncome;
  lastIncome = key;
  try { if (!(await rpc<boolean>("publish_income", { p_income: Number(key) })) && lastIncome === key) lastIncome = before; }
  catch { if (lastIncome === key) lastIncome = before; /* bourse des villes indisponible : la partie n'en dépend pas */ }
}

type SharesReply = { credit: number; float: number; sold: number;
  held: { city: string; name: string; qty: number; cost: number; net_worth: number; income: number }[];
  holders: { holder: string; name: string; qty: number }[] };
/** Relit ses parts sur le serveur et les applique à la partie (paiements reçus compris). `false` si la bourse des villes n'est pas disponible. */
export async function syncShares(): Promise<boolean> {
  const uid = active;
  if (!uid) return false;
  const r = await rpc<SharesReply | null>("sync_shares", {}).catch(() => null);
  if (!r || active !== uid) return false;
  const server: E.ShareState = {
    credit: Number(r.credit) || 0, float: Number(r.float) || 0, sold: Number(r.sold) || 0,
    held: (r.held ?? []).map((h) => ({ city: h.city, name: String(h.name ?? "Ville").slice(0, 40), qty: Number(h.qty) || 0, cost: Number(h.cost) || 0, netWorth: Number(h.net_worth) || 0, income: Number(h.income) || 0 })),
    holders: (r.holders ?? []).map((h) => ({ holder: h.holder, name: String(h.name ?? "Ville").slice(0, 40), qty: Number(h.qty) || 0 })),
  };
  // Partie recommencée : elle ne garde pas les parts achetées par l'ancienne
  if (!useGame.getState().game.shares && server.held.length) {
    if (!(await rpc<boolean>("drop_my_shares", {}).catch(() => false)) || active !== uid) return false;
    server.held = [];
  }
  const g = useGame.getState().game, next = E.setShares(g, server, Date.now());
  if (next !== g) useGame.setState({ game: next });
  return true;
}

// ─── Registre des mouvements d'argent (serveur → partie) ───
/** Partie qui n'a encore rien appliqué (nouvelle, ou d'avant le registre) : elle part de la dernière ligne existante. */
async function ensureLedger(): Promise<boolean> {
  if (useGame.getState().game.ledger !== undefined) return true;
  const uid = active;
  const head = await rpc<number>("ledger_head", {}).catch(() => null);
  if (head === null || active !== uid) return false;
  const g = useGame.getState().game;
  if (g.ledger === undefined) useGame.setState({ game: { ...g, ledger: Number(head) || 0 } });
  return true;
}
/** Applique les mouvements d'argent du serveur pas encore appliqués à cette partie. */
export async function syncLedger() {
  const uid = active;
  if (!uid || !(await ensureLedger())) return;
  const head = useGame.getState().game.ledger ?? 0;
  const rows = await restAsUser<E.LedgerRow[]>(`player_ledger?select=id,amount,label,kind&id=gt.${head}&order=id.asc&limit=200`);
  if (!rows?.length || active !== uid) return;
  const g = useGame.getState().game, next = E.applyLedger(g, rows, Date.now());
  if (next !== g) useGame.setState({ game: next });
}

/** Achète des parts d'une ville, `maxCost` au plus. Renvoie le prix payé, ou `null` si le serveur a refusé
 *  (plus assez de parts en vente, prix monté entre-temps). Lève une erreur si le serveur ne répond pas. */
export async function buyCityShares(city: string, name: string, qty: number, maxCost: number): Promise<number | null> {
  if (!useGame.getState().game.shares && !(await syncShares())) throw new Error("bourse des villes indisponible");
  if (!(await ensureLedger())) throw new Error("serveur indisponible");
  // Le prix est retiré par le registre du serveur, en même temps que les parts sont données (jamais l'un sans l'autre)
  const cost = Number(await rpc<number | null>("buy_city_shares_l", { p_city: city, p_qty: Math.floor(qty), p_max_cost: Math.floor(maxCost), p_label: `Bourse des villes : ${Math.floor(qty)} parts de ${name}` })) || 0;
  await syncLedger();
  await syncShares();
  return cost > 0 ? cost : null;
}
/** Guerre économique : rachat hostile des parts restantes d'une ville dont on détient déjà une bonne part. Mêmes retours que l'achat. */
export async function hostileBid(city: string, name: string, maxCost: number): Promise<number | null> {
  if (!(await ensureLedger())) throw new Error("serveur indisponible");
  const cost = Number(await rpc<number | null>("hostile_bid_l", { p_city: city, p_max_cost: Math.floor(maxCost), p_label: `Bourse des villes : rachat hostile de ${name}` })) || 0;
  await syncLedger();
  await syncShares();
  return cost > 0 ? cost : null;
}
/** Rachète des parts de sa propre ville à un actionnaire, au prix du jour. Mêmes retours que l'achat. */
export async function buybackCityShares(holder: string, name: string, qty: number, maxCost: number): Promise<number | null> {
  if (!(await ensureLedger())) throw new Error("serveur indisponible");
  const cost = Number(await rpc<number | null>("buyback_city_shares_l", { p_holder: holder, p_qty: Math.floor(qty), p_max_cost: Math.floor(maxCost), p_label: `Bourse des villes : rachat de ${Math.floor(qty)} parts à ${name}` })) || 0;
  await syncLedger();
  await syncShares();
  return cost > 0 ? cost : null;
}
/** Met des parts de sa ville en vente (0 à 490). `false` = refusé (moins que ce qui est déjà vendu, ville trop petite). */
export async function setShareFloat(n: number): Promise<boolean> {
  const ok = await rpc<boolean>("set_share_float", { p_float: Math.floor(n) });
  await syncShares();
  return !!ok;
}

// ─── Alliances ───
// Le serveur tient la liste des membres et la caisse commune ; le jeu applique le bonus et débite les versements.

export interface AllianceRow { id: string; name: string; tag: string; leader: string | null; treasury: number; blockade_target?: string | null; blockade_until?: string | null; shield_until?: string | null }
/** Relit son alliance sur le serveur et l'applique à la partie. `false` si les alliances ne sont pas disponibles. */
export async function syncAlliance(): Promise<boolean> {
  const uid = active;
  if (!uid) return false;
  const mine = await restAsUser<{ alliance: string | null; alliance_gift: number }[]>(`players?select=alliance,alliance_gift&id=eq.${uid}&limit=1`);
  if (!mine || active !== uid) return false;
  let alliance: E.AllianceState | null = null;
  const id = mine[0]?.alliance;
  if (id) {
    const [rows, members, wars] = await Promise.all([
      restAsUser<AllianceRow[]>(`alliances?select=id,name,tag,leader,treasury&id=eq.${id}&limit=1`),
      restAsUser<{ id: string }[]>(`players?select=id&alliance=eq.${id}&limit=50`),
      // Guerre économique : blocus menés ou subis par mon alliance (absent tant que le serveur ne les connaît pas)
      restAsUser<AllianceRow[]>(`alliances?select=id,tag,blockade_target,blockade_until,shield_until&or=(id.eq.${id},blockade_target.eq.${id})&limit=20`),
    ]);
    if (!rows?.[0] || !members || active !== uid) return false;
    alliance = { id, name: String(rows[0].name).slice(0, 24), tag: String(rows[0].tag).slice(0, 4), treasury: Number(rows[0].treasury) || 0, leader: rows[0].leader, members: members.map((m) => m.id), gift: Number(mine[0].alliance_gift) || 0 };
    const now = Date.now(), ms = (v?: string | null) => (v ? Date.parse(v) || 0 : 0), tagOf = new Map<string, string>();
    const all = await restAsUser<{ id: string; tag: string }[]>("alliances?select=id,tag&limit=200");
    for (const a of all ?? []) tagOf.set(a.id, a.tag);
    for (const w of wars ?? []) {
      if (ms(w.blockade_until) > now) {
        if (w.id === id && w.blockade_target) alliance.blockading = { tag: tagOf.get(w.blockade_target) ?? "?", until: ms(w.blockade_until) };
        else if (w.blockade_target === id && (!alliance.blockadedBy || ms(w.blockade_until) > alliance.blockadedBy.until)) alliance.blockadedBy = { tag: w.tag, until: ms(w.blockade_until) };
      }
      if (w.id === id && ms(w.shield_until) > now) alliance.shieldUntil = ms(w.shield_until);
    }
  }
  const g = useGame.getState().game, next = E.setAlliance(g, alliance);
  if (next !== g) useGame.setState({ game: next });
  return true;
}
/** Fonde une alliance (le prix est débité par le registre du serveur). `false` = refusé : nom ou sigle déjà pris ou invalide.
 *  `cost` : affiché par l'appelant, le serveur applique le même (ALLIANCE.cost). */
export async function createAlliance(name: string, tag: string, cost: number): Promise<boolean> {
  void cost;
  if (!(await ensureLedger())) return false;
  const id = await rpc<string | null>("create_alliance_l", { p_name: name, p_tag: tag });
  await syncLedger();
  await syncAlliance();
  return !!id;
}
export async function joinAlliance(id: string): Promise<boolean> {
  const ok = await rpc<boolean>("join_alliance", { p_id: id });
  await syncAlliance();
  return !!ok;
}
export async function leaveAlliance(): Promise<boolean> {
  const ok = await rpc<boolean>("leave_alliance", {});
  await syncAlliance();
  return !!ok;
}
/** Guerre économique : déclare un blocus contre une autre alliance (payé par la caisse commune). `false` = refusé. */
export async function declareBlockade(target: string): Promise<boolean> {
  const ok = await rpc<boolean>("declare_blockade", { p_target: target });
  await syncAlliance();
  return !!ok;
}
/** Verse de l'argent à la caisse commune : il ne se retire pas. `false` = refusé. */
export async function contributeAlliance(amount: number): Promise<boolean> {
  if (!(await ensureLedger())) return false;
  const total = await rpc<number | null>("contribute_alliance_l", { p_amount: Math.floor(amount) });
  await syncLedger();
  await syncAlliance();
  return total !== null && total !== undefined;
}

/** Le compte est ouvert : on mémorise l'appareil et on sauvegarde à chaque changement. */
function finish(uid: string, name: string) {
  try { localStorage.setItem(LINK_KEY, uid); } catch { /* stockage indisponible */ }
  // Le pseudo du serveur fait foi (lu juste après) ; le nom du compte ne sert qu'en attendant, pour une partie sans nom
  setPlayerName(useOnline.getState().name ?? (useGame.getState().game.playerName ? "" : name));
  unsubGame?.();
  unsubGame = useGame.subscribe((s, p) => {
    if (s.game === p.game || !active) return;
    // Compte de test : sa partie reste en mode test quoi qu'il arrive. « Recommencer la partie » repartait d'une partie
    // ordinaire, sans argent illimité, jusqu'au prochain rechargement de la page.
    if (useOnline.getState().tester && !s.game.sandbox) { useGame.setState({ game: E.enterSandbox(s.game, null) }); return; }
    dirty = true;
    // Nouvelle opération dans le journal de la partie = une action du joueur (les jours qui passent n'en ajoutent pas)
    if (s.game.transactions[0] !== p.game.transactions[0]) urgent = true;
    if (useGame.getState().cloud === "saved") setCloud("syncing");
    schedule();
  });
  useOnline.setState({ phase: "ready" });
  adoptCountry();
  void publishCity(pack(useGame.getState().game).pl);
  void publishOffer();
  void syncContracts();
  void publishIncome();
  void syncShares();
  void syncAlliance();
  void syncLedger();
  // Conditions d'utilisation : acceptées sur un autre appareil ? Alors inutile de les redemander ici (et inversement).
  void restAsUser<{ terms_version: string | null }[]>(`player_prefs?select=terms_version&id=eq.${uid}&limit=1`).then((r) => {
    if (active !== uid) return;
    const server = r ? r[0]?.terms_version ?? null : null;
    if (server !== TERMS_VERSION && termsAccepted()) { acceptTermsEverywhere(); return; }
    if (server === TERMS_VERSION) acceptTerms();
    useOnline.setState({ terms: server });
  }).catch(() => { if (active === uid) useOnline.setState({ terms: null }); });
  // Compte de test : sa partie est toujours en mode test (argent et capital sans limite, tout débloqué)
  void restAsUser<{ tester: boolean; name: string | null }[]>(`players?select=tester,name&id=eq.${uid}&limit=1`).then((r) => {
    if (active !== uid) return;
    const tester = !!r?.[0]?.tester, pseudo = r?.[0]?.name || null;
    useOnline.setState({ tester, name: pseudo });
    if (pseudo) setPlayerName(pseudo);
    const g = useGame.getState().game;
    if (tester && !g.sandbox) useGame.setState({ game: E.enterSandbox(g, null) });
  }).catch(() => {});
}

async function connect(uid: string, name: string) {
  active = uid;
  setCloud("syncing");
  useOnline.setState({ phase: "connecting" });
  try {
    // Crée le profil du joueur à sa première connexion (nom et avatar lus depuis Discord) et lui attribue un pays
    // Plusieurs villes par pays : `join_world_v2` place aussi les joueurs quand il ne reste aucun pays vide.
    // Tant que cette fonction n'existe pas sur le serveur, on garde l'ancienne (un pays par joueur).
    const prefs = { p_countries: countryPreference(uid) };
    const joined = await rpc<{ country: string | null }[]>("join_world_v2", prefs).catch(() => rpc<{ country: string | null }[]>("join_world", prefs));
    if (active !== uid) return; // déconnecté entre-temps
    useOnline.setState({ country: joined?.[0]?.country ?? null });
    // L'heure du serveur avant tout calcul de jours : changer l'heure du téléphone ne fait pas passer le temps
    await syncClock();
    if (active !== uid) return;

    // D'abord la date seule (quelques octets) : la sauvegarde n'est téléchargée que s'il le faut
    const meta = await restAsUser<{ saved_at: number }[]>("saves?select=saved_at&limit=1");
    if (active !== uid) return;
    // Pas de réponse : on ne sait pas s'il existe une sauvegarde, donc on n'écrit surtout rien
    if (!meta) throw new Error("sauvegarde illisible");
    let previous: string | null = null;
    try { previous = localStorage.getItem(LINK_KEY); } catch { /* stockage indisponible */ }
    const local = useGame.getState();
    if (meta[0]) {
      const remoteAt = Number(meta[0].saved_at);
      lastCheck = Date.now();
      // La sauvegarde en ligne fait foi dès qu'elle a changé depuis la dernière synchronisation de cet appareil
      // (ou sur un appareil jamais lié à ce compte). La date locale ne sert pas à trancher : elle avance toute seule
      // à chaque jour de ville rattrapé à l'ouverture, ce qui faisait écraser la vraie partie par celle de l'appareil.
      const move = openingMove({ linked: previous === uid, remoteAt, syncedAt: syncedAt(uid), localAt: local.savedAt });
      base = remoteAt; // « push » et « same » : l'appareil était à jour de cette sauvegarde ; « pull » la relit
      // Les deux côtés ont bougé : cet appareil a des actions jamais enregistrées (hors ligne, ou fermé trop vite), et la
      // partie en ligne a changé depuis (autre appareil). Avant, celle de l'appareil était perdue sans prévenir.
      const both = move === "pull" && previous === uid && syncedAt(uid) !== null && unsyncedFor(uid);
      const keepLocal = both && typeof window !== "undefined" && window.confirm(
        "Votre partie a changé à deux endroits.\n\nCet appareil a des actions pas encore enregistrées en ligne, et votre partie en ligne a été jouée ailleurs depuis.\n\nOK : garder la partie de CET appareil (celle en ligne est remplacée).\nAnnuler : reprendre la partie en ligne (les actions de cet appareil sont perdues).");
      if (keepLocal) {
        dirty = true; urgent = true;
        await flush();
        if (active !== uid) return;
      } else if (move === "pull") {
        await pull(uid);
        if (active !== uid) return;
      } else if (move === "push") {
        dirty = true;
        await flush();
      } else {
        setCloud("saved"); // déjà à jour : ni lecture ni écriture
      }
      finish(uid, name);
      return;
    }
    // Aucune sauvegarde en ligne : nouveau compte, donc toujours une partie neuve. La partie de l'appareil ne compte pas :
    // elle existe dès la première ouverture du site, et ses jours rattrapés offraient des centaines de milliers d'euros
    // à qui s'inscrivait plus tard (c'est aussi, parfois, la partie de quelqu'un d'autre).
    useGame.getState().reset();
    setPlayerName(name);
    useOnline.setState({ phase: "new" });
  } catch {
    if (active !== uid) return;
    setCloud("error");
    useOnline.setState({ phase: "error" });
  }
}

/** Change le pseudo public. Renvoie `null` si c'est fait, sinon le message à afficher. */
export async function setPseudo(name: string): Promise<string | null> {
  const user = useAuth.getState().user;
  if (!user || active !== user.id) return "Connexion perdue, reconnectez-vous.";
  const problem = pseudoProblem(name);
  if (problem) return problem;
  try {
    const r = await rpc<{ name?: string; error?: string }>("set_name", { p_name: tidyPseudo(name) });
    if (active !== user.id) return null;
    if (!r?.name) return PSEUDO_ERRORS[r?.error ?? ""] ?? "Pseudo refusé.";
    useOnline.setState({ name: r.name });
    setPlayerName(r.name);
    return null;
  } catch { return "Le serveur n'a pas répondu, réessayez dans un instant."; }
}

/** Création du compte : nomme la ville et enregistre la première sauvegarde en ligne. */
export async function createAccount(cityName: string): Promise<string | null> {
  const user = useAuth.getState().user;
  if (!user || active !== user.id) return "Connexion perdue, reconnectez-vous.";
  // La partie commence maintenant, au jour 1 avec l'argent de départ : le temps passé sur cet écran ne rapporte rien
  const g = useGame.getState().game;
  const r = E.renameCity({ ...E.newGame(now(), g.playerName), country: g.country }, cityName);
  if (!r.ok) return r.error;
  useGame.setState({ game: r.state, savedAt: Date.now() });
  dirty = true;
  lastWrite = 0;
  await flush();
  if (useGame.getState().cloud === "error") return "Le serveur n'a pas répondu, réessayez dans un instant.";
  finish(user.id, useOnline.getState().name ?? user.name);
  return null;
}

/** Déménagement : réserve une place dans le pays côté serveur. `false` = pays complet. Lève une erreur si le serveur ne répond pas. */
export async function reserveCountry(country: string): Promise<boolean> {
  const ok = await rpc<boolean>("move_country", { p_country: country });
  if (ok) useOnline.setState({ country });
  return !!ok;
}

/** Nouvel essai après une erreur de serveur. */
export function retryOnline() {
  const user = useAuth.getState().user;
  if (user) connect(user.id, user.name);
}

/** Jouer quand même : la partie reste sur l'appareil, rien n'est envoyé au serveur avant la prochaine connexion. */
export function playOffline() {
  useOnline.setState((s) => ({ phase: "ready", terms: s.terms === undefined ? null : s.terms }));
}

// ─── Filet de sécurité : une partie effacée par « Recommencer » reste récupérable ───
/** Durée pendant laquelle le serveur garde la partie d'avant une remise à zéro. */
export const BACKUP_DAYS = 7;
/** Date à laquelle une partie a été mise de côté par le serveur, ou `null` s'il n'y en a pas (ou plus). */
export async function backupAt(): Promise<number | null> {
  if (!active) return null;
  const rows = await restAsUser<{ backup_at: string | null }[]>("saves?select=backup_at&limit=1");
  const at = rows?.[0]?.backup_at ? Date.parse(rows[0].backup_at) : NaN;
  return Number.isFinite(at) && Date.now() - at < BACKUP_DAYS * 86_400_000 ? at : null;
}
/** Reprend la partie mise de côté : elle remplace la partie en cours. `false` s'il n'y en a pas ou si le serveur ne répond pas. */
export async function restoreBackup(): Promise<boolean> {
  const uid = active;
  if (!uid || writing) return false;
  writing = true;
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    if (!(await rpc<boolean>("restore_save", {}))) return false;
    await pull(uid);
    adoptCountry();
    return true;
  } catch { return false; } finally { writing = false; }
}

/** Enregistre tout de suite ce qui ne l'est pas encore (avant de changer de compte, par exemple).
 *  Le serveur n'accepte qu'une écriture toutes les 20 secondes : s'il refuse, on attend son feu vert et on réessaie.
 *  Renvoie `false` si la partie n'a pas pu être enregistrée. */
export async function saveNow(): Promise<boolean> {
  if (!active || useOnline.getState().phase !== "ready") return true;
  for (let i = 0; i < 3 && dirty; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, Math.min(SERVER_GAP + 1_000, Math.max(1_000, lastWrite + SERVER_GAP + 1_000 - Date.now()))));
    if (timer) { clearTimeout(timer); timer = null; }
    await flush();
  }
  return !dirty;
}

function disconnect() {
  active = null;
  unsubGame?.(); unsubGame = null;
  if (timer) { clearTimeout(timer); timer = null; }
  dirty = false;
  base = null;
  lastSent = "";
  lastCheck = 0;
  lastCity = "";
  lastOffer = "";
  lastIncome = "";
  useOnline.setState({ country: null, phase: "idle", tester: false, name: null, terms: undefined });
  setCloud("local");
}

let started = false;
export function startOnline() {
  if (started || STATIC_MODE) return;
  started = true;
  const apply = (s: ReturnType<typeof useAuth.getState>) => {
    if (s.status === "in" && s.user && s.user.id !== active) {
      if (active) disconnect(); // changement de compte : on repart d'un état propre avant de charger l'autre partie
      connect(s.user.id, s.user.name);
    }
    if (s.status === "out" && active) disconnect();
  };
  apply(useAuth.getState());
  useAuth.subscribe(apply);
  // Dernière sauvegarde en quittant ou en changeant d'onglet
  // Dernière sauvegarde en quittant. Trop tôt après la précédente (le serveur la refuserait) : on la retente dès que
  // possible, tant que le navigateur laisse tourner la page (avant, elle était simplement abandonnée).
  const leave = () => {
    if (!dirty) return;
    const left = lastWrite + SERVER_GAP + 300 - Date.now();
    if (left <= 0) { void flush(true); return; }
    if (timer) clearTimeout(timer);
    timerAt = Date.now() + left;
    timer = setTimeout(() => { timer = null; void flush(true); }, left);
  };
  // Actions faites sur cet appareil et pas encore en ligne (même hors ligne) : retenu sur l'appareil
  useGame.subscribe((s, p) => {
    if (s.game.transactions[0] !== p.game.transactions[0] && s.game.transactions.length >= p.game.transactions.length) markUnsynced(useAuth.getState().user?.id ?? null);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) leave(); else void refresh(); });
  window.addEventListener("pagehide", leave);
  window.addEventListener("focus", () => void refresh());
  // Un autre onglet prend la main : dernière sauvegarde de celui-ci avant la pause
  beforePause(() => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (dirty) void flush(true);
  });
}
