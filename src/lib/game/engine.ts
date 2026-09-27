// Moteur économique — pur (aucun accès au DOM ni au réseau), donc testable
// et réutilisable tel quel côté serveur (fonction planifiée) plus tard.
import {
  ACTIVE_RATIO, BUILDING_BY_ID, DAY_LENGTH_MINUTES, DEMOLISH_REFUND, ENERGY_PER_RESIDENT,
  EXPORT_RATIO, FOOD_PER_RESIDENT, MAINTENANCE_RATE, MAX_CATCHUP_DAYS, RESOURCE_PRICES,
  STARTING_BUILDINGS, STARTING_CASH, STARTING_POPULATION, TAX_PER_RESIDENT, TRADE_FEE_MIN, TRADE_FEE_RATE,
} from "./config";
import { isBuildable, layoutFrom, placeTile, type Plot } from "./layout";
import { ASSET_BY_SYMBOL } from "../market/universe";
import { FOLDER_LIMIT_BASE, RESEARCH_BY_ID, STARTING_RESEARCH } from "./research";

export interface Holding { qty: number; avgCost: number }

export interface Transaction {
  id: string;
  at: number;
  kind: "buy" | "sell" | "build" | "demolish" | "research";
  label: string;
  symbol?: string;
  qty?: number;
  price?: number;
  amount: number; // effet sur les liquidités (négatif = sortie)
}

export interface Folder { id: string; name: string; symbols: string[]; notes: string }

export interface Snapshot {
  at: number;
  day: number;
  netWorth: number;
  cash: number;
  portfolio: number;
  city: number;
  population: number;
  income: number;
  expenses: number;
}

export interface GameState {
  version: 1;
  playerName: string;
  cityName: string;
  createdAt: number;
  lastTick: number;
  day: number;
  cash: number;
  population: number;
  buildings: Record<string, number>;
  /** Emplacement de chaque bâtiment sur la carte (vue isométrique). */
  plots: Plot[];
  holdings: Record<string, Holding>;
  /** Recherches acquises. */
  research: string[];
  /** Dossiers d'analyse du joueur. */
  folders: Folder[];
  /** Guide de démarrage fermé par le joueur. */
  tutorialDone?: boolean;
  transactions: Transaction[];
  history: Snapshot[];
}

export type Prices = Record<string, number>;

export const DAY_MS = DAY_LENGTH_MINUTES * 60_000;

export function newGame(now: number, playerName = "Celyan", cityName = "Nova City"): GameState {
  const s: GameState = {
    version: 1,
    playerName,
    cityName,
    createdAt: now,
    lastTick: now,
    day: 1,
    cash: STARTING_CASH,
    population: STARTING_POPULATION,
    buildings: { ...STARTING_BUILDINGS },
    plots: layoutFrom(STARTING_BUILDINGS),
    holdings: {},
    research: [...STARTING_RESEARCH],
    folders: [],
    transactions: [],
    history: [],
  };
  s.history.push(snapshot(s, {}, now));
  return s;
}

// ─── Ville ────────────────────────────────────────────────────

export interface CityStats {
  housing: number;
  freeHousing: number;
  jobs: number;
  active: number;
  employed: number;
  unemployed: number;
  unemploymentRate: number;
  openJobs: number;
  energy: { prod: number; use: number; balance: number };
  food: { prod: number; use: number; balance: number };
  satisfaction: number;
  income: { taxes: number; buildings: number; exports: number; total: number };
  expenses: { maintenance: number; imports: number; total: number };
  exportsValue: number;
  importsValue: number;
  tradeBalance: number;
  net: number;
  /** Coût total des bâtiments (sert au calcul de l'entretien). */
  cityValue: number;
  /** Valeur comptée dans le patrimoine : bâtiments construits par le joueur
   *  (la ville offerte au départ n'y entre pas, le patrimoine initial = 100 000 €). */
  assetValue: number;
  growth: number;
}

export function computeCity(state: Pick<GameState, "buildings" | "population">): CityStats {
  let housing = 0, jobs = 0, energyProd = 0, energyUse = 0, foodProd = 0, bRevenue = 0, cityValue = 0, assetValue = 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    const b = BUILDING_BY_ID[id];
    if (!b || count <= 0) continue;
    housing += (b.housing ?? 0) * count;
    jobs += (b.jobs ?? 0) * count;
    energyProd += (b.energyProd ?? 0) * count;
    energyUse += (b.energyUse ?? 0) * count;
    foodProd += (b.foodProd ?? 0) * count;
    bRevenue += (b.revenue ?? 0) * count;
    cityValue += b.cost * count;
    assetValue += b.cost * Math.max(0, count - (STARTING_BUILDINGS[id] ?? 0));
  }
  const pop = Math.min(state.population, housing);
  energyUse += pop * ENERGY_PER_RESIDENT;
  const foodUse = pop * FOOD_PER_RESIDENT;

  const active = Math.round(pop * ACTIVE_RATIO);
  const employed = Math.min(active, jobs);
  const unemployed = active - employed;
  const unemploymentRate = active > 0 ? unemployed / active : 0;
  const openJobs = Math.max(0, jobs - active);
  const freeHousing = Math.max(0, housing - pop);

  const energyBalance = energyProd - energyUse;
  const foodBalance = foodProd - foodUse;

  // Satisfaction : une seule statistique (doc §7)
  let satisfaction = 0.95;
  satisfaction -= unemploymentRate * 1.2;
  if (housing > 0 && freeHousing / housing < 0.02) satisfaction -= 0.05; // ville saturée
  if (energyBalance < 0) satisfaction -= 0.08;
  if (foodBalance < 0) satisfaction -= 0.08;
  satisfaction = clamp(satisfaction, 0.1, 1);

  // Revenus
  const taxes = pop * TAX_PER_RESIDENT * (0.6 + 0.4 * satisfaction) * (1 - unemploymentRate * 0.5);
  // Les bâtiments tournent au prorata des travailleurs disponibles
  const staffing = jobs > 0 ? employed / jobs : 0;
  const buildingsIncome = bRevenue * staffing;

  const exportsValue = Math.max(0, energyBalance) * RESOURCE_PRICES.energy * EXPORT_RATIO
    + Math.max(0, foodBalance) * RESOURCE_PRICES.food * EXPORT_RATIO;
  const importsValue = Math.max(0, -energyBalance) * RESOURCE_PRICES.energy
    + Math.max(0, -foodBalance) * RESOURCE_PRICES.food;

  const maintenance = cityValue * MAINTENANCE_RATE;
  const incomeTotal = taxes + buildingsIncome + exportsValue;
  const expensesTotal = maintenance + importsValue;

  // Croissance de population (doc §8) : logements libres × emplois × satisfaction
  let growth = 0;
  if (state.population > housing) {
    growth = housing - state.population; // démolition : départ immédiat
  } else if (freeHousing > 0) {
    const jobPull = clamp(0.3 + (openJobs / Math.max(1, active)) * 3, 0.2, 1.5);
    growth = Math.min(freeHousing, Math.max(3, Math.round(pop * 0.08 * satisfaction * jobPull)));
  } else if (unemploymentRate > 0.2 && satisfaction < 0.5) {
    growth = -Math.round(pop * 0.01);
  }

  return {
    housing, freeHousing, jobs, active, employed, unemployed, unemploymentRate, openJobs,
    energy: { prod: energyProd, use: energyUse, balance: energyBalance },
    food: { prod: foodProd, use: foodUse, balance: foodBalance },
    satisfaction,
    income: { taxes, buildings: buildingsIncome, exports: exportsValue, total: incomeTotal },
    expenses: { maintenance, imports: importsValue, total: expensesTotal },
    exportsValue, importsValue,
    tradeBalance: exportsValue - importsValue,
    net: incomeTotal - expensesTotal,
    cityValue,
    assetValue,
    growth,
  };
}

// ─── Patrimoine ───────────────────────────────────────────────

export function portfolioValue(holdings: Record<string, Holding>, prices: Prices): number {
  let v = 0;
  for (const [sym, h] of Object.entries(holdings)) v += h.qty * (prices[sym] ?? h.avgCost);
  return v;
}

export function portfolioCost(holdings: Record<string, Holding>): number {
  return Object.values(holdings).reduce((a, h) => a + h.qty * h.avgCost, 0);
}

export function snapshot(state: GameState, prices: Prices, at: number): Snapshot {
  const c = computeCity(state);
  const portfolio = portfolioValue(state.holdings, prices);
  return {
    at, day: state.day,
    cash: state.cash, portfolio, city: c.assetValue,
    netWorth: state.cash + portfolio + c.assetValue,
    population: state.population,
    income: c.income.total, expenses: c.expenses.total,
  };
}

// ─── Temps ────────────────────────────────────────────────────

export function tickDay(state: GameState, prices: Prices, at: number): GameState {
  const c = computeCity(state);
  const next: GameState = {
    ...state,
    day: state.day + 1,
    cash: round2(state.cash + c.net),
    population: Math.max(0, state.population + c.growth),
  };
  next.history = [...state.history, snapshot(next, prices, at)].slice(-500);
  return next;
}

/** Rattrape les jours écoulés depuis le dernier passage. */
export function catchUp(state: GameState, now: number, prices: Prices): { state: GameState; days: number } {
  const elapsed = Math.floor((now - state.lastTick) / DAY_MS);
  if (elapsed <= 0) return { state, days: 0 };
  const days = Math.min(elapsed, MAX_CATCHUP_DAYS);
  let s = state;
  for (let i = 0; i < days; i++) {
    const at = now - (days - 1 - i) * DAY_MS;
    s = tickDay(s, prices, at);
  }
  s = { ...s, lastTick: state.lastTick + elapsed * DAY_MS };
  return { state: s, days };
}

// ─── Actions du joueur ────────────────────────────────────────

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

export function tradeFee(amount: number): number {
  return Math.max(TRADE_FEE_MIN, round2(amount * TRADE_FEE_RATE));
}

export function buy(state: GameState, symbol: string, qty: number, price: number, at: number): ActionResult {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Quantité invalide." };
  if (!(price > 0)) return { ok: false, error: "Prix indisponible." };
  const need = ASSET_BY_SYMBOL[symbol]?.research;
  if (need && !hasResearch(state, need)) return { ok: false, error: `Débloquez d'abord « ${RESEARCH_BY_ID[need]?.name ?? need} » dans Recherche.` };
  const gross = round2(qty * price);
  const fee = tradeFee(gross);
  const total = gross + fee;
  if (total > state.cash + 1e-6) return { ok: false, error: "Liquidités insuffisantes." };
  const prev = state.holdings[symbol] ?? { qty: 0, avgCost: 0 };
  const newQty = prev.qty + qty;
  const avgCost = (prev.qty * prev.avgCost + gross) / newQty;
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - total),
      holdings: { ...state.holdings, [symbol]: { qty: newQty, avgCost } },
      transactions: addTx(state, { kind: "buy", label: `Achat ${qty} × ${symbol}`, symbol, qty, price, amount: -total, at }),
    },
  };
}

export function sell(state: GameState, symbol: string, qty: number, price: number, at: number): ActionResult {
  const h = state.holdings[symbol];
  if (!h || h.qty <= 0) return { ok: false, error: "Vous ne détenez pas cette action." };
  if (!Number.isFinite(qty) || qty <= 0 || qty > h.qty + 1e-9) return { ok: false, error: "Quantité invalide." };
  if (!(price > 0)) return { ok: false, error: "Prix indisponible." };
  const gross = round2(qty * price);
  const fee = tradeFee(gross);
  const holdings = { ...state.holdings };
  const left = h.qty - qty;
  if (left <= 1e-9) delete holdings[symbol];
  else holdings[symbol] = { qty: left, avgCost: h.avgCost };
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash + gross - fee),
      holdings,
      transactions: addTx(state, { kind: "sell", label: `Vente ${qty} × ${symbol}`, symbol, qty, price, amount: gross - fee, at }),
    },
  };
}

/** Construit un bâtiment ; `tile` choisi par le joueur, sinon placement automatique. */
export function build(state: GameState, buildingId: string, at: number, tile?: { x: number; y: number }): ActionResult {
  const b = BUILDING_BY_ID[buildingId];
  if (!b || b.buildable === false) return { ok: false, error: "Bâtiment inconnu." };
  if (b.unlockPop && state.population < b.unlockPop) return { ok: false, error: `Débloqué à ${b.unlockPop} habitants.` };
  if (b.cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  if (tile && !isTileFree(state, tile.x, tile.y)) return { ok: false, error: "Emplacement occupé ou sur une route." };
  const plots = tile ? [...state.plots, { id: b.id, x: tile.x, y: tile.y }] : addPlot(state.plots, b.id);
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - b.cost,
      buildings: { ...state.buildings, [b.id]: (state.buildings[b.id] ?? 0) + 1 },
      plots,
      transactions: addTx(state, { kind: "build", label: `Construction : ${b.name}`, amount: -b.cost, at }),
    },
  };
}

/** Démolit un bâtiment ; `tile` précise lequel, sinon le dernier construit de ce type. */
export function demolish(state: GameState, buildingId: string, at: number, tile?: { x: number; y: number }): ActionResult {
  const b = BUILDING_BY_ID[buildingId];
  if (tile && !state.plots.some((p) => p.id === buildingId && p.x === tile.x && p.y === tile.y)) return { ok: false, error: "Aucun bâtiment de ce type ici." };
  const count = state.buildings[buildingId] ?? 0;
  if (!b || b.buildable === false || count <= 0) return { ok: false, error: "Rien à démolir." };
  const refund = b.cost * DEMOLISH_REFUND;
  const buildings = { ...state.buildings, [b.id]: count - 1 };
  if (buildings[b.id] === 0) delete buildings[b.id];
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash + refund,
      buildings,
      plots: tile ? state.plots.filter((p) => !(p.x === tile.x && p.y === tile.y)) : removePlot(state.plots, b.id),
      transactions: addTx(state, { kind: "demolish", label: `Démolition : ${b.name}`, amount: refund, at }),
    },
  };
}

// ─── Carte ────────────────────────────────────────────────────

export function isTileFree(state: Pick<GameState, "plots">, x: number, y: number) {
  return isBuildable(x, y) && !state.plots.some((p) => p.x === x && p.y === y);
}

/** Déplace un bâtiment (gratuit). */
export function moveBuilding(state: GameState, from: { x: number; y: number }, to: { x: number; y: number }): ActionResult {
  const plot = state.plots.find((p) => p.x === from.x && p.y === from.y);
  if (!plot) return { ok: false, error: "Aucun bâtiment à déplacer ici." };
  if (from.x === to.x && from.y === to.y) return { ok: true, state };
  if (!isTileFree(state, to.x, to.y)) return { ok: false, error: "Emplacement occupé ou sur une route." };
  return { ok: true, state: { ...state, plots: state.plots.map((p) => p === plot ? { ...p, x: to.x, y: to.y } : p) } };
}

function addPlot(plots: Plot[], id: string): Plot[] {
  const t = placeTile(plots, id);
  return t ? [...plots, { id, ...t }] : plots;
}

function removePlot(plots: Plot[], id: string): Plot[] {
  const i = plots.map((p) => p.id).lastIndexOf(id);
  return i < 0 ? plots : [...plots.slice(0, i), ...plots.slice(i + 1)];
}

/** Répare une sauvegarde : plan manquant ou incohérent avec les bâtiments. */
export function normalize(input: GameState): GameState {
  let state = input;
  if (!Array.isArray(state.research)) state = { ...state, research: [...STARTING_RESEARCH] };
  else if (STARTING_RESEARCH.some((r) => !state.research.includes(r))) state = { ...state, research: [...new Set([...STARTING_RESEARCH, ...state.research])] };
  if (!Array.isArray(state.folders)) state = { ...state, folders: [] };
  const plots = Array.isArray(state.plots) ? state.plots : [];
  const counts: Record<string, number> = {};
  for (const p of plots) counts[p.id] = (counts[p.id] ?? 0) + 1;
  const same = Object.keys({ ...counts, ...state.buildings }).every((k) => (counts[k] ?? 0) === (state.buildings[k] ?? 0));
  return same && Array.isArray(state.plots) ? state : { ...state, plots: layoutFrom(state.buildings) };
}

// ─── Recherche ────────────────────────────────────────────────

export const hasResearch = (state: Pick<GameState, "research">, id: string) => state.research.includes(id);

export function doResearch(state: GameState, id: string, at: number): ActionResult {
  const n = RESEARCH_BY_ID[id];
  if (!n) return { ok: false, error: "Recherche inconnue." };
  if (hasResearch(state, id)) return { ok: false, error: "Déjà acquis." };
  const missing = n.requires.filter((r) => !hasResearch(state, r));
  if (missing.length) return { ok: false, error: `Nécessite d'abord : ${missing.map((r) => `« ${RESEARCH_BY_ID[r].name} »`).join(" et ")}.` };
  if (n.cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - n.cost,
      research: [...state.research, id],
      transactions: addTx(state, { kind: "research", label: `Recherche : ${n.name}`, amount: -n.cost, at }),
    },
  };
}

// ─── Profil ───────────────────────────────────────────────────

export function renameCity(state: GameState, name: string): ActionResult {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 32);
  if (clean.length < 2) return { ok: false, error: "Le nom doit faire au moins 2 caractères." };
  return { ok: true, state: { ...state, cityName: clean } };
}

// ─── Dossiers ─────────────────────────────────────────────────

export const folderLimit = (state: Pick<GameState, "research">) => (hasResearch(state, "folders_plus") ? Infinity : FOLDER_LIMIT_BASE);

export function createFolder(state: GameState, name: string, at: number, symbols: string[] = []): ActionResult {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Donnez un nom au dossier." };
  if (state.folders.length >= folderLimit(state)) return { ok: false, error: "Limite atteinte : recherchez « Dossiers illimités »." };
  const folder: Folder = { id: `f${at.toString(36)}${state.folders.length}`, name: clean, symbols: [...new Set(symbols)], notes: "" };
  return { ok: true, state: { ...state, folders: [...state.folders, folder] } };
}

export function updateFolder(state: GameState, id: string, patch: Partial<Omit<Folder, "id">>): ActionResult {
  if (!state.folders.some((f) => f.id === id)) return { ok: false, error: "Dossier introuvable." };
  return {
    ok: true,
    state: {
      ...state,
      folders: state.folders.map((f) => f.id !== id ? f : {
        ...f,
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 40) || f.name } : {}),
        ...(patch.symbols !== undefined ? { symbols: [...new Set(patch.symbols)] } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes.slice(0, 4000) } : {}),
      }),
    },
  };
}

export function deleteFolder(state: GameState, id: string): ActionResult {
  return { ok: true, state: { ...state, folders: state.folders.filter((f) => f.id !== id) } };
}

// ─── Utilitaires ──────────────────────────────────────────────

function addTx(state: GameState, tx: Omit<Transaction, "id">): Transaction[] {
  const id = `${tx.at.toString(36)}-${state.transactions.length}`;
  return [{ id, ...tx }, ...state.transactions].slice(0, 200);
}

export function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
export function round2(v: number) { return Math.round(v * 100) / 100; }
