"use client";
// Partie en ligne sur le site publié (compte Discord + Supabase).
// Économe en données :
// - une seule ligne par joueur pour la sauvegarde, écrasée (pas d'historique côté serveur) ;
// - sauvegarde au format compact (voir lib/game/pack.ts) ;
// - au plus une écriture toutes les 5 minutes, seulement si le contenu a vraiment changé,
//   + une dernière écriture quand on quitte la page ;
// - à l'ouverture, on ne télécharge la sauvegarde que si elle a changé depuis la dernière synchronisation de l'appareil ;
// - avant chaque écriture et à chaque retour sur l'onglet, on relit seulement la date de la sauvegarde (quelques octets) :
//   si un autre appareil a enregistré entre-temps, c'est sa partie qui est reprise, jamais écrasée ;
// - sauvegarde et chiffres du classement envoyés en un seul appel.
import { create } from "zustand";
import * as E from "@/lib/game/engine";
import { pack, unpack } from "@/lib/game/pack";
import { useGame } from "@/store/game";
import { restAsUser, rpc, useAuth } from "@/lib/auth";
import { STATIC_MODE } from "@/lib/market/client";
import { countryPreference } from "@/lib/world/countries";
import { openingMove } from "@/lib/syncRule";

const LINK_KEY = "market-empire-linked";
const SYNC_KEY = "market-empire-synced";
const MIN_GAP = 5 * 60_000;
const DEBOUNCE = 30_000;

/** Où en est l'ouverture de la partie en ligne, une fois connecté avec Discord :
 *  - connecting : lecture du compte ;
 *  - new        : première connexion, le joueur doit créer son compte (nom de sa ville) ;
 *  - ready      : la partie est chargée, on peut jouer ;
 *  - error      : le serveur n'a pas répondu. */
export type OnlinePhase = "idle" | "connecting" | "new" | "ready" | "error";
/** Pays (territoire) du joueur connecté, et étape d'ouverture du compte. */
/** `tester` = compte de test désigné dans la base : il peut activer le mode test (Ville › Options). */
export const useOnline = create<{ country: string | null; phase: OnlinePhase; tester: boolean }>(() => ({ country: null, phase: "idle", tester: false }));

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
/** Dernier contenu envoyé : on n'écrit pas deux fois la même chose. */
let lastSent = "";
/** Dernier plan de ville publié (ce que les autres joueurs voient en visitant). */
let lastCity = "";

/** Publie le plan de la ville, seulement s'il a changé. Sans effet si le serveur ne propose pas encore la fonction. */
async function publishCity(pl: Record<string, number[]>) {
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
  useGame.setState({ game: E.normalize(unpack(rows[0].data)), savedAt: at });
  setSynced(uid, at);
  dirty = false; lastSent = "";
  useGame.getState().sync();
  setCloud("saved");
}

let lastCheck = 0;
/** Retour sur l'onglet : si un autre appareil a enregistré entre-temps, on reprend sa partie. */
async function refresh() {
  const uid = active;
  if (!uid || writing || useOnline.getState().phase !== "ready" || Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now();
  const at = await serverAt().catch(() => undefined);
  if (active !== uid || writing || typeof at !== "number" || at === syncedAt(uid)) return;
  writing = true;
  try {
    await pull(uid);
    adoptCountry();
    useGame.getState().notify("Partie mise à jour depuis votre autre appareil");
  } catch { setCloud("error"); }
  writing = false;
}

async function flush(keepalive = false) {
  if (!active || writing || !dirty) return;
  const uid = active;
  writing = true;
  try {
    // Un autre appareil a-t-il enregistré depuis notre dernière synchronisation ? Alors on reprend sa partie au lieu de l'écraser.
    const at = await serverAt();
    if (active !== uid) { writing = false; return; }
    if (at === undefined) throw new Error("sauvegarde illisible");
    lastCheck = Date.now();
    if (at !== null && at !== syncedAt(uid)) {
      await pull(uid);
      adoptCountry();
      useGame.getState().notify("Partie mise à jour depuis votre autre appareil");
      writing = false;
      return;
    }
    dirty = false;
    const s = useGame.getState();
    const data = pack(s.game), fig = figures();
    const body = JSON.stringify([data, fig]);
    if (body === lastSent) { writing = false; setCloud("saved"); return; }
    const sentAt = s.savedAt || Date.now();
    const ok = await rpc<boolean>("save_game", { p_data: data, p_saved_at: sentAt, ...fig }, { keepalive });
    if (ok === false) { dirty = true; schedule(); } // le serveur limite à une écriture toutes les 20 s
    else {
      lastWrite = Date.now(); lastSent = body; setCloud("saved");
      // On retient la date réellement enregistrée (relue sur le serveur quand la page reste ouverte)
      const stored = keepalive ? sentAt : await serverAt().catch(() => undefined);
      if (active === uid) setSynced(uid, typeof stored === "number" ? stored : sentAt);
      if (!keepalive) { void publishCity(data.pl); void publishOffer(); void publishIncome(); void syncShares(); void syncAlliance(); }
    }
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

/** Le pays réservé côté serveur fait foi : la partie le reprend (c'est lui qui donne la spécialité de la ville). */
function adoptCountry() {
  const country = useOnline.getState().country, g = useGame.getState().game;
  if (country && g.country !== country) useGame.setState({ game: { ...g, country } });
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

/** Achète des parts d'une ville, `maxCost` au plus. Renvoie le prix payé, ou `null` si le serveur a refusé
 *  (plus assez de parts en vente, prix monté entre-temps). Lève une erreur si le serveur ne répond pas. */
export async function buyCityShares(city: string, name: string, qty: number, maxCost: number): Promise<number | null> {
  if (!useGame.getState().game.shares && !(await syncShares())) throw new Error("bourse des villes indisponible");
  const cost = Number(await rpc<number | null>("buy_city_shares", { p_city: city, p_qty: Math.floor(qty), p_max_cost: Math.floor(maxCost) })) || 0;
  if (cost > 0) useGame.setState({ game: E.payShares(useGame.getState().game, cost, `Bourse des villes : ${Math.floor(qty)} parts de ${name}`, Date.now()) });
  await syncShares();
  return cost > 0 ? cost : null;
}
/** Guerre économique : rachat hostile des parts restantes d'une ville dont on détient déjà une bonne part. Mêmes retours que l'achat. */
export async function hostileBid(city: string, name: string, maxCost: number): Promise<number | null> {
  const cost = Number(await rpc<number | null>("hostile_bid", { p_city: city, p_max_cost: Math.floor(maxCost) })) || 0;
  if (cost > 0) useGame.setState({ game: E.payShares(useGame.getState().game, cost, `Bourse des villes : rachat hostile de ${name}`, Date.now()) });
  await syncShares();
  return cost > 0 ? cost : null;
}
/** Rachète des parts de sa propre ville à un actionnaire, au prix du jour. Mêmes retours que l'achat. */
export async function buybackCityShares(holder: string, name: string, qty: number, maxCost: number): Promise<number | null> {
  const cost = Number(await rpc<number | null>("buyback_city_shares", { p_holder: holder, p_qty: Math.floor(qty), p_max_cost: Math.floor(maxCost) })) || 0;
  if (cost > 0) useGame.setState({ game: E.payShares(useGame.getState().game, cost, `Bourse des villes : rachat de ${Math.floor(qty)} parts à ${name}`, Date.now()) });
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
const pay = (cost: number, label: string) => useGame.setState({ game: E.payAlliance(useGame.getState().game, cost, label, Date.now()) });

/** Fonde une alliance (le prix est débité une fois le serveur d'accord). `false` = refusé : nom ou sigle déjà pris ou invalide. */
export async function createAlliance(name: string, tag: string, cost: number): Promise<boolean> {
  const id = await rpc<string | null>("create_alliance", { p_name: name, p_tag: tag });
  if (id) pay(cost, `Alliance fondée : ${name.trim()}`);
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
  const total = await rpc<number | null>("contribute_alliance", { p_amount: Math.floor(amount) });
  if (total !== null && total !== undefined) pay(Math.floor(amount), "Versement à la caisse de l'alliance");
  await syncAlliance();
  return total !== null && total !== undefined;
}

/** Le compte est ouvert : on mémorise l'appareil et on sauvegarde à chaque changement. */
function finish(uid: string, name: string) {
  try { localStorage.setItem(LINK_KEY, uid); } catch { /* stockage indisponible */ }
  setPlayerName(name);
  unsubGame?.();
  unsubGame = useGame.subscribe((s, p) => {
    if (s.game === p.game || !active) return;
    dirty = true;
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
  void restAsUser<{ tester: boolean }[]>(`players?select=tester&id=eq.${uid}&limit=1`).then((r) => { if (active === uid) useOnline.setState({ tester: !!r?.[0]?.tester }); }).catch(() => {});
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
      if (move === "pull") {
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
    // Aucune sauvegarde en ligne : nouveau compte. Si l'appareil servait à un autre compte,
    // on repart d'une partie neuve (on ne donne pas la partie de quelqu'un d'autre).
    if (previous && previous !== uid) useGame.getState().reset();
    setPlayerName(name);
    useOnline.setState({ phase: "new" });
  } catch {
    if (active !== uid) return;
    setCloud("error");
    useOnline.setState({ phase: "error" });
  }
}

/** Création du compte : nomme la ville et enregistre la première sauvegarde en ligne. */
export async function createAccount(cityName: string): Promise<string | null> {
  const user = useAuth.getState().user;
  if (!user || active !== user.id) return "Connexion perdue, reconnectez-vous.";
  const r = E.renameCity(useGame.getState().game, cityName);
  if (!r.ok) return r.error;
  useGame.setState({ game: r.state, savedAt: Date.now() });
  dirty = true;
  lastWrite = 0;
  await flush();
  if (useGame.getState().cloud === "error") return "Le serveur n'a pas répondu, réessayez dans un instant.";
  finish(user.id, user.name);
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
  useOnline.setState({ phase: "ready" });
}

function disconnect() {
  active = null;
  unsubGame?.(); unsubGame = null;
  if (timer) { clearTimeout(timer); timer = null; }
  dirty = false;
  lastSent = "";
  lastCheck = 0;
  lastCity = "";
  lastOffer = "";
  lastIncome = "";
  useOnline.setState({ country: null, phase: "idle", tester: false });
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
  document.addEventListener("visibilitychange", () => { if (document.hidden) leave(); else void refresh(); });
  window.addEventListener("pagehide", leave);
  window.addEventListener("focus", () => void refresh());
}
