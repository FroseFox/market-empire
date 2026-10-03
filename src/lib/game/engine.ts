// Moteur économique — pur (aucun accès au DOM ni au réseau), donc testable
// et réutilisable tel quel côté serveur (fonction planifiée) plus tard.
import {
  ACTIVE_RATIO, BUILDING_BY_ID, DAY_LENGTH_MINUTES, DEMOLISH_REFUND, ENERGY_PER_RESIDENT,
  EXPORT_RATIO, FOOD_PER_RESIDENT, MAINTENANCE_RATE, MAX_CATCHUP_DAYS, RESOURCE_PRICES,
  BRANCH_COST, BRANCH_EFFECTS, BRANCH_MIN_VALUE, CONTRACT_RATIO, FINANCE_FEE_FACTOR, HUB_DESK_COST, HUB_FEE_FACTOR,
  NEED_PER_RANK, POLLUTION_FACTOR, POLLUTION_MAX, PRESTIGE_PER_GOAL, PRESTIGE_PER_RANK, PROJECTS, PROJECT_BY_ID,
  RENOVATE_RATE, TERRITORY, WEAR_MAINTENANCE, WEAR_PER_DAY, WEAR_SATISFACTION,
  CITY_RANKS, FORECAST_DAYS, GOALS, UPGRADES, SERVICES, SERVICE_BONUS, SERVICE_IDS,
  STARTING_BUILDINGS, STARTING_CASH, STARTING_POPULATION, TAX_PER_RESIDENT, TRADE_FEE_MIN, TRADE_FEE_RATE,
  type Goal, type ServiceId, type Specialty,
} from "./config";
import { isBuildable, layoutFrom, placeTile, type Plot } from "./layout";
import { HUBS, HUB_BY_NAME, PLAYABLE, countryBonus, countryPrice, countrySpecialty, type Hub } from "../world/countries";
import { ASSET_BY_SYMBOL, familyOf, regionOf, type Asset } from "../market/universe";
import { FOLDER_LIMIT_BASE, RESEARCH_BY_ID, STARTING_RESEARCH } from "./research";

export interface Holding { qty: number; avgCost: number }

export interface Transaction {
  id: string;
  at: number;
  kind: "buy" | "sell" | "build" | "demolish" | "research" | "reward" | "move";
  label: string;
  symbol?: string;
  qty?: number;
  price?: number;
  amount: number; // effet sur les liquidités (négatif = sortie)
  /** Vente : plus-value réalisée, frais déduits (absent des anciennes opérations). */
  gain?: number;
}

export interface Folder {
  id: string; name: string; symbols: string[]; notes: string;
  /** Date et cours de chaque entreprise au moment de son ajout (absent des anciens dossiers). */
  added?: Record<string, { at: number; price: number }>;
}

/** Garde les repères des entreprises encore présentes, en crée un pour les nouvelles dont le cours est connu. */
function trackAdded(prev: Folder["added"], symbols: string[], at: number, prices: Prices): Folder["added"] {
  const out: NonNullable<Folder["added"]> = {};
  for (const s of symbols) {
    if (prev?.[s]) out[s] = prev[s];
    else if (prices[s] > 0) out[s] = { at, price: prices[s] };
  }
  return out;
}

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
  /** Flux net de la ville réellement encaissé au passage de ce jour (absent des anciennes sauvegardes). */
  flow?: number;
  /** Coûts du jour écoulé : frais de courtage, recherche, pertes de démolition. */
  fees?: number;
  research?: number;
  demolish?: number;
}

/** Coûts « perdus » depuis le dernier passage de jour (ils ne se retrouvent dans aucun actif). */
export interface DayCosts {
  fees: number; research: number; demolish: number;
  /** Mouvements exceptionnels de la ville (subventions d'objectifs en plus, déménagement en moins), comptés dans son flux. */
  extra?: number;
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
  /** Objectifs de ville déjà récompensés. */
  goals?: string[];
  /** Pays choisi par le joueur (code ISO numérique) ; absent tant qu'il n'a pas déménagé. */
  country?: string;
  /** Entreprises implantées dans la ville : actives tant que le joueur détient au moins `minQty` titres. */
  branches?: Branch[];
  /** Places financières où le joueur a ouvert un bureau. */
  hubs?: string[];
  /** Contrats de commerce avec d'autres joueurs (copie de ce que le serveur connaît). */
  contracts?: Contract[];
  /** Vétusté de la ville, de 0 à 1 : monte chaque jour, retombe à 0 à la rénovation. */
  wear?: number;
  /** Grands projets achevés. */
  projects?: string[];
  /** Agrandissements du territoire achetés (indice dans TERRITORY). */
  territory?: number;
  /** Coûts du jour en cours, versés dans l'historique au prochain passage de jour. */
  today?: DayCosts;
  /** Total des plus-values réalisées depuis que le jeu les enregistre. */
  realized?: number;
  transactions: Transaction[];
  history: Snapshot[];
}

/** Entreprise implantée. Son bâtiment sur la carte est le plot « branch » de même rang (1re entreprise ↔ 1er plot « branch »). */
export interface Branch { symbol: string; minQty: number }
export interface Contract { id: string; resource: "energy" | "food"; qty: number; side: "buy" | "sell"; partner: string }

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
  /** Équipements publics : capacité, part de la population desservie, besoin apparu ou non. */
  services: Record<ServiceId, { capacity: number; coverage: number; needed: boolean }>;
  /** Ce qui fait bouger la satisfaction (en points, négatif = pénalité), pour l'expliquer au joueur. */
  factors: { label: string; value: number }[];
  /** Rang de la ville (indice dans CITY_RANKS). */
  rank: number;
  /** Pollution émise et absorbée par jour, et points de satisfaction perdus. */
  pollution: { emitted: number; absorbed: number; penalty: number };
  /** Vétusté (0 à 1). */
  wear: number;
  /** Spécialité du pays où la ville est installée, et son bonus. */
  specialty: Specialty | null;
  bonus: number;
  /** Nombre d'entreprises implantées actives. */
  branches: number;
  /** Quantités réellement échangées par contrat aujourd'hui. */
  contracts: { energySold: number; energyBought: number; foodSold: number; foodBought: number };
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

/** Ce dont le calcul de la ville a besoin ; seuls les bâtiments et la population sont obligatoires. */
export type CityInput = Pick<GameState, "buildings" | "population">
  & Partial<Pick<GameState, "branches" | "holdings" | "country" | "wear" | "projects" | "contracts" | "territory">>;

/** Côté de la carte du joueur (elle s'agrandit avec le territoire). */
export const mapSize = (state: Partial<Pick<GameState, "territory">>) => TERRITORY[clamp(state.territory ?? 0, 0, TERRITORY.length - 1)].size;

/** Entreprises implantées dont la participation est toujours détenue. */
export function activeBranches(state: Partial<Pick<GameState, "branches" | "holdings">>): Branch[] {
  return (state.branches ?? []).filter((b) => (state.holdings?.[b.symbol]?.qty ?? 0) >= b.minQty - 1e-9);
}

export function computeCity(state: CityInput): CityStats {
  const capacity: Record<ServiceId, number> = { park: 0, school: 0, safety: 0, hospital: 0 };
  const specialty = state.country && PLAYABLE[state.country] ? countrySpecialty(state.country) : null;
  const bonus = specialty && state.country ? countryBonus(state.country) : 0;
  const projects = (state.projects ?? []).map((id) => PROJECT_BY_ID[id]).filter(Boolean);
  // Revenus d'une catégorie : spécialité du pays et grands projets
  const revBoost = (cat: string) => 1 + (specialty === cat ? bonus : 0)
    + projects.reduce((a, p) => a + (p.perk.kind === "revenue" && p.perk.category === cat ? p.perk.bonus : 0), 0);

  let housing = 0, jobs = 0, energyProd = 0, energyUse = 0, foodProd = 0, bRevenue = 0, cityValue = 0, assetValue = 0, emitted = 0, absorbed = 0;
  for (const [id, count] of Object.entries(state.buildings)) {
    const b = BUILDING_BY_ID[id];
    if (!b || count <= 0) continue;
    housing += (b.housing ?? 0) * count;
    jobs += (b.jobs ?? 0) * count;
    energyProd += (b.energyProd ?? 0) * count;
    energyUse += (b.energyUse ?? 0) * count;
    foodProd += (b.foodProd ?? 0) * count;
    bRevenue += (b.revenue ?? 0) * count * revBoost(b.category);
    if (b.service) capacity[b.service] += (b.serves ?? 0) * count;
    if ((b.pollution ?? 0) > 0) emitted += b.pollution! * count; else absorbed -= (b.pollution ?? 0) * count;
    cityValue += b.cost * count;
    assetValue += b.cost * Math.max(0, count - (STARTING_BUILDINGS[id] ?? 0));
  }
  // Entreprises implantées (actives tant que la participation est détenue)
  const branches = activeBranches(state);
  for (const br of branches) {
    const asset = ASSET_BY_SYMBOL[br.symbol];
    if (!asset) continue;
    const e = BRANCH_EFFECTS[familyOf(asset)];
    jobs += e.jobs; bRevenue += e.revenue; energyUse += e.energyUse ?? 0; energyProd += e.energyProd ?? 0; foodProd += e.foodProd ?? 0;
    if (e.service) capacity[e.service] += e.serves ?? 0;
  }
  if (specialty === "energy") energyProd *= 1 + bonus;
  if (specialty === "agri") foodProd *= 1 + bonus;
  // Les grands projets comptent dans le patrimoine (pas d'entretien)
  assetValue += projects.reduce((a, p) => a + p.cost, 0);
  // Le territoire acheté aussi
  for (let i = 1; i <= Math.min(state.territory ?? 0, TERRITORY.length - 1); i++) assetValue += TERRITORY[i].cost;

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
  const rank = cityRank(state.population);
  const wear = clamp(state.wear ?? 0, 0, 1);
  const pollutionPenalty = Math.min(POLLUTION_MAX, POLLUTION_FACTOR * Math.max(0, emitted - absorbed) / Math.max(10, pop / 100));

  // Satisfaction : une seule statistique (doc §7), expliquée par ses facteurs
  const factors: CityStats["factors"] = [];
  const factor = (label: string, value: number) => { if (Math.abs(value) >= 0.0005) factors.push({ label, value }); };
  factor("Chômage", -unemploymentRate * 1.2);
  if (housing > 0 && freeHousing / housing < 0.02) factor("Logements saturés", -0.05);
  if (energyBalance < 0) factor("Manque d'énergie", -0.08);
  if (foodBalance < 0) factor("Manque de nourriture", -0.08);
  factor("Pollution", -pollutionPenalty);
  factor("Vétusté", -wear * WEAR_SATISFACTION);
  // Équipements publics : un bonus quand ils sont là, une pénalité (qui monte avec le rang) quand la ville les attend
  const services = {} as CityStats["services"];
  for (const id of SERVICE_IDS) {
    const rule = SERVICES[id];
    const coverage = pop > 0 ? Math.min(1, capacity[id] / pop) : capacity[id] > 0 ? 1 : 0;
    const needed = pop >= rule.needPop;
    services[id] = { capacity: capacity[id], coverage, needed };
    factor(rule.label, SERVICE_BONUS * coverage - (needed ? rule.weight * (1 + NEED_PER_RANK * rank) * (1 - coverage) : 0));
  }
  for (const p of projects) if (p.perk.kind === "satisfaction") factor(p.name, p.perk.bonus);
  const satisfaction = clamp(0.95 + factors.reduce((a, f) => a + f.value, 0), 0.1, 1);

  // Revenus
  const taxes = pop * TAX_PER_RESIDENT * (0.6 + 0.4 * satisfaction) * (1 - unemploymentRate * 0.5);
  // Les bâtiments tournent au prorata des travailleurs disponibles
  const staffing = jobs > 0 ? employed / jobs : 0;
  const buildingsIncome = bRevenue * staffing;

  // Commerce : les contrats entre joueurs passent d'abord (meilleur prix des deux côtés), le reste au prix du marché
  const contracted = (resource: Contract["resource"], side: Contract["side"]) =>
    (state.contracts ?? []).reduce((a, c) => a + (c.resource === resource && c.side === side ? c.qty : 0), 0);
  const trade = (balance: number, resource: Contract["resource"], price: number) => {
    const surplus = Math.max(0, balance), deficit = Math.max(0, -balance);
    const sold = Math.min(surplus, contracted(resource, "sell")), bought = Math.min(deficit, contracted(resource, "buy"));
    return {
      exports: (sold * CONTRACT_RATIO + (surplus - sold) * EXPORT_RATIO) * price,
      imports: (bought * CONTRACT_RATIO + (deficit - bought)) * price,
      sold, bought,
    };
  };
  const te = trade(energyBalance, "energy", RESOURCE_PRICES.energy), tf = trade(foodBalance, "food", RESOURCE_PRICES.food);
  const exportsValue = te.exports + tf.exports;
  const importsValue = te.imports + tf.imports;

  const maintenance = cityValue * MAINTENANCE_RATE * (1 + wear * WEAR_MAINTENANCE);
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
    satisfaction, services, factors, rank,
    pollution: { emitted, absorbed, penalty: pollutionPenalty },
    wear, specialty, bonus, branches: branches.length,
    contracts: { energySold: te.sold, energyBought: te.bought, foodSold: tf.sold, foodBought: tf.bought },
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

/** La vétusté n'apparaît qu'à partir du rang « Bourg » : un village n'a pas encore ce souci. */
const nextWear = (wear = 0, population: number) => (cityRank(population) >= 1 ? Math.min(1, wear + WEAR_PER_DAY) : wear);

/** Rang atteint pour une population donnée (indice dans CITY_RANKS). */
export function cityRank(population: number): number {
  let r = 0;
  for (let i = 0; i < CITY_RANKS.length; i++) if (population >= CITY_RANKS[i].pop) r = i;
  return r;
}

// ─── Objectifs ────────────────────────────────────────────────

export interface GoalStatus { goal: Goal; value: number; progress: number; done: boolean; claimed: boolean }

function goalValue(goal: Goal, state: Pick<GameState, "population"> & Partial<Pick<GameState, "projects">>, c: CityStats): number {
  const big = state.population >= (goal.minPop ?? 0);
  switch (goal.metric) {
    case "population": return state.population;
    case "net": return c.net;
    case "satisfaction": return big ? c.satisfaction : 0;
    case "autonomy": return big && c.energy.balance >= 0 && c.food.balance >= 0 ? 1 : 0;
    case "services": return big ? Math.min(...SERVICE_IDS.map((id) => c.services[id].coverage)) : 0;
    case "projects": return state.projects?.length ?? 0;
    case "branches": return c.branches;
  }
}

/** Avancement de chaque objectif de ville. */
export function goalStatuses(state: CityInput & Partial<Pick<GameState, "goals">>, city = computeCity(state)): GoalStatus[] {
  return GOALS.map((goal) => {
    const value = goalValue(goal, state, city);
    return { goal, value, progress: clamp(value / goal.target, 0, 1), done: value >= goal.target - 1e-9, claimed: !!state.goals?.includes(goal.id) };
  });
}

/** Encaisse la subvention d'un objectif atteint (une seule fois). */
export function claimGoal(state: GameState, id: string, at: number): ActionResult {
  const st = goalStatuses(state).find((g) => g.goal.id === id);
  if (!st) return { ok: false, error: "Objectif inconnu." };
  if (st.claimed) return { ok: false, error: "Subvention déjà encaissée." };
  if (!st.done) return { ok: false, error: "Objectif pas encore atteint." };
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash + st.goal.reward),
      goals: [...(state.goals ?? []), id],
      today: spend(state, "extra", st.goal.reward),
      transactions: addTx(state, { kind: "reward", label: `Subvention : ${st.goal.label}`, amount: st.goal.reward, at }),
    },
  };
}

// ─── Monde ────────────────────────────────────────────────────

/** Installe la ville dans un autre pays, au prix de ce pays. `current` = pays occupé jusque-là. */
export function relocate(state: GameState, country: string, at: number, current?: string | null): ActionResult {
  if (!PLAYABLE[country]) return { ok: false, error: "Pays non jouable." };
  if (country === (current ?? state.country)) return { ok: false, error: "Votre ville est déjà dans ce pays." };
  const price = countryPrice(country);
  if (price > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - price),
      country,
      today: spend(state, "extra", -price),
      transactions: addTx(state, { kind: "move", label: `Déménagement : ${PLAYABLE[country]}`, amount: -price, at }),
    },
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
    wear: nextWear(state.wear, state.population),
  };
  delete next.today;
  const t = state.today ?? NO_COSTS;
  next.history = [...state.history, {
    ...snapshot(next, prices, at), flow: round2(c.net + (t.extra ?? 0)), fees: t.fees, research: t.research, demolish: t.demolish,
  }].slice(-500);
  return next;
}

// ─── Bilan de période ─────────────────────────────────────────

const NO_COSTS: DayCosts = { fees: 0, research: 0, demolish: 0 };

function spend(state: GameState, key: keyof DayCosts, v: number): DayCosts {
  const t = state.today ?? NO_COSTS;
  return { ...t, [key]: round2((t[key] ?? 0) + v) };
}

/** Flux de ville encaissé au jour `i` ; estimé d'après la veille pour les anciennes sauvegardes. */
export function dayFlow(history: Snapshot[], i: number): number {
  const s = history[i];
  if (s.flow !== undefined) return s.flow;
  const prev = history[i - 1];
  return prev ? prev.income - prev.expenses : 0;
}

export interface PeriodReport {
  /** Nombre de jours de ville couverts. */
  days: number;
  start: number;
  end: number;
  /** Effet des cours (gains et pertes, latents ou réalisés) : ce qui reste une fois tout le reste expliqué. */
  market: number;
  /** Flux nets de la ville encaissés. */
  city: number;
  fees: number;
  research: number;
  demolish: number;
}

/** Explique la variation du patrimoine depuis le `points`-ième instantané en partant de la fin. */
export function periodReport(state: Pick<GameState, "history" | "today">, netWorthNow: number, points: number): PeriodReport {
  const h = state.history;
  const from = Math.max(0, h.length - points);
  const start = h[from]?.netWorth ?? netWorthNow;
  const t = state.today ?? NO_COSTS;
  let city = t.extra ?? 0, fees = t.fees, research = t.research, demolish = t.demolish;
  for (let i = from + 1; i < h.length; i++) {
    city += dayFlow(h, i);
    fees += h[i].fees ?? 0;
    research += h[i].research ?? 0;
    demolish += h[i].demolish ?? 0;
  }
  const market = netWorthNow - start - city + fees + research + demolish;
  return { days: Math.max(0, h.length - 1 - from), start, end: netWorthNow, market: round2(market), city: round2(city), fees: round2(fees), research: round2(research), demolish: round2(demolish) };
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

export function tradeFee(amount: number, factor = 1): number {
  return Math.max(TRADE_FEE_MIN, round2(amount * TRADE_FEE_RATE * factor));
}

const HUB_COVERS: Record<Hub["scope"], (a: Asset) => boolean> = {
  us: (a) => a.kind === "stock" && regionOf(a) === "États-Unis",
  europe: (a) => a.kind === "stock" && regionOf(a) === "Europe",
  asia: (a) => a.kind === "stock" && regionOf(a) === "Asie",
  world: (a) => a.kind === "stock" && regionOf(a) === "Autres",
  etf: (a) => a.kind === "etf",
  commodity: (a) => a.kind === "commodity",
};
type FeeInput = Partial<Pick<GameState, "country" | "hubs" | "projects">>;
/** Le joueur a-t-il un bureau dans cette place ? (gratuit quand sa ville est dans le pays de la place) */
export const hasDesk = (state: FeeInput, hub: Hub) => hub.country === state.country || !!state.hubs?.includes(hub.name);
/** Place financière qui couvre un actif, s'il y en a une. */
export const hubFor = (symbol: string): Hub | undefined => {
  const a = ASSET_BY_SYMBOL[symbol];
  return a ? HUBS.find((h) => HUB_COVERS[h.scope](a)) : undefined;
};
/** Ce qui réduit les frais de courtage sur un actif : spécialité « Finance » du pays, bureau dans la place, grand projet. */
export function feeFactor(state: FeeInput, symbol: string): number {
  let f = 1;
  if (state.country && PLAYABLE[state.country] && countrySpecialty(state.country) === "finance") f *= 1 - countryBonus(state.country) * FINANCE_FEE_FACTOR;
  const hub = hubFor(symbol);
  if (hub && hasDesk(state, hub)) f *= HUB_FEE_FACTOR;
  for (const id of state.projects ?? []) { const p = PROJECT_BY_ID[id]; if (p?.perk.kind === "fees") f *= p.perk.factor; }
  return f;
}

/** Ouvre un bureau dans une place financière. */
export function openDesk(state: GameState, hubName: string, at: number): ActionResult {
  const hub = HUB_BY_NAME[hubName];
  if (!hub) return { ok: false, error: "Place financière inconnue." };
  if (hasDesk(state, hub)) return { ok: false, error: "Vous y avez déjà un bureau." };
  if (HUB_DESK_COST > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - HUB_DESK_COST),
      hubs: [...(state.hubs ?? []), hub.name],
      today: spend(state, "fees", HUB_DESK_COST),
      transactions: addTx(state, { kind: "research", label: `Bureau à ${hub.name}`, amount: -HUB_DESK_COST, at }),
    },
  };
}

// ─── Entreprises implantées ───────────────────────────────────

/** Nombre maximal d'entreprises implantées : une par rang de ville atteint. */
/** Entreprise installée sur un carreau de la carte, s'il y en a une. */
export function branchAt(state: Pick<GameState, "plots"> & Partial<Pick<GameState, "branches">>, x: number, y: number): Branch | undefined {
  const sites = state.plots.filter((p) => p.id === "branch");
  const i = sites.findIndex((p) => p.x === x && p.y === y);
  return i < 0 ? undefined : state.branches?.[i];
}

export const branchLimit = (state: Pick<GameState, "population">) => cityRank(state.population) + 1;
export const branchCost = (state: Partial<Pick<GameState, "branches">>) => BRANCH_COST * ((state.branches?.length ?? 0) + 1);

/** Propose à une entreprise dont le joueur est actionnaire d'ouvrir un site dans la ville. */
export function openBranch(state: GameState, symbol: string, price: number, at: number): ActionResult {
  const asset = ASSET_BY_SYMBOL[symbol], h = state.holdings[symbol];
  if (!asset || asset.kind !== "stock") return { ok: false, error: "Seules les entreprises cotées peuvent s'implanter." };
  if (state.branches?.some((b) => b.symbol === symbol)) return { ok: false, error: "Cette entreprise est déjà implantée." };
  if (!(price > 0) || !h || h.qty * price < BRANCH_MIN_VALUE) return { ok: false, error: `Il faut détenir au moins ${BRANCH_MIN_VALUE.toLocaleString("fr-FR")} € de cette entreprise.` };
  if ((state.branches?.length ?? 0) >= branchLimit(state)) return { ok: false, error: "Limite atteinte : une entreprise de plus à chaque rang de ville." };
  const cost = branchCost(state);
  if (cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  const tile = placeTile(state.plots, "branch", mapSize(state));
  if (!tile) return { ok: false, error: "Plus de place sur la carte." };
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - cost),
      branches: [...(state.branches ?? []), { symbol, minQty: BRANCH_MIN_VALUE / price }],
      buildings: { ...state.buildings, branch: (state.buildings.branch ?? 0) + 1 },
      plots: [...state.plots, { id: "branch", ...tile }],
      today: spend(state, "extra", -cost),
      transactions: addTx(state, { kind: "build", label: `Implantation : ${asset.name}`, amount: -cost, at }),
    },
  };
}

/** Ferme le site d'une entreprise (sans remboursement). */
export function closeBranch(state: GameState, symbol: string): ActionResult {
  const index = state.branches?.findIndex((b) => b.symbol === symbol) ?? -1;
  if (index < 0) return { ok: false, error: "Cette entreprise n'est pas implantée." };
  // Son bâtiment est le plot « branch » de même rang
  const plot = state.plots.filter((p) => p.id === "branch")[index];
  const buildings: Record<string, number> = { ...state.buildings, branch: (state.buildings.branch ?? 1) - 1 };
  if (buildings.branch <= 0) delete buildings.branch;
  return { ok: true, state: { ...state, branches: state.branches!.filter((b) => b.symbol !== symbol), buildings, plots: state.plots.filter((p) => p !== plot) } };
}

// ─── Tensions et fin de partie ────────────────────────────────

export const renovateCost = (state: CityInput) => Math.round((state.wear ?? 0) * computeCity(state).cityValue * RENOVATE_RATE);

/** Rénove toute la ville : la vétusté retombe à zéro. */
export function renovate(state: GameState, at: number): ActionResult {
  const cost = renovateCost(state);
  if (cost <= 0) return { ok: false, error: "La ville est en bon état." };
  if (cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  return {
    ok: true,
    state: {
      ...state, cash: round2(state.cash - cost), wear: 0,
      today: spend(state, "extra", -cost),
      transactions: addTx(state, { kind: "build", label: "Rénovation de la ville", amount: -cost, at }),
    },
  };
}

/** Lance un grand projet (compté dans le patrimoine). */
export function buildProject(state: GameState, id: string, at: number): ActionResult {
  const p = PROJECT_BY_ID[id];
  if (!p) return { ok: false, error: "Projet inconnu." };
  if (state.projects?.includes(id)) return { ok: false, error: "Projet déjà achevé." };
  if (cityRank(state.population) < p.minRank) return { ok: false, error: `Réservé au rang « ${CITY_RANKS[p.minRank].name} ».` };
  if (p.cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  return {
    ok: true,
    state: {
      ...state, cash: round2(state.cash - p.cost), projects: [...(state.projects ?? []), id],
      transactions: addTx(state, { kind: "build", label: `Grand projet : ${p.name}`, amount: -p.cost, at }),
    },
  };
}

/** Prochain agrandissement du territoire, s'il en reste un. */
export const nextTerritory = (state: Partial<Pick<GameState, "territory">>) => TERRITORY[(state.territory ?? 0) + 1];

/** Achète l'agrandissement suivant du territoire : la carte gagne 4 carreaux de chaque côté. */
export function expandTerritory(state: GameState, at: number): ActionResult {
  const next = nextTerritory(state);
  if (!next) return { ok: false, error: "Territoire déjà au maximum." };
  if (cityRank(state.population) < next.minRank) return { ok: false, error: `Réservé au rang « ${CITY_RANKS[next.minRank].name} ».` };
  if (next.cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  return {
    ok: true,
    state: {
      ...state, cash: round2(state.cash - next.cost), territory: (state.territory ?? 0) + 1,
      transactions: addTx(state, { kind: "build", label: `Territoire agrandi : ${next.size} × ${next.size}`, amount: -next.cost, at }),
    },
  };
}

// ─── Journal d'absence ────────────────────────────────────────

export interface AbsenceReport {
  days: number;
  /** Ce que la ville a encaissé (ou perdu) pendant l'absence. */
  cityFlow: number;
  population: { from: number; to: number };
  rank: { from: number; to: number };
  satisfaction: { from: number; to: number };
  /** Faits marquants, du plus important au moins important. */
  notes: { tone: "good" | "bad" | "info"; text: string }[];
}

/** Ce qui a changé entre le départ du joueur et son retour (`before` et `after` encadrent le rattrapage des jours). */
export function absenceReport(before: GameState, after: GameState): AbsenceReport {
  const a = computeCity(before), b = computeCity(after);
  const notes: AbsenceReport["notes"] = [];
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
  if (b.rank > a.rank) notes.push({ tone: "good", text: `Votre ville est passée au rang « ${CITY_RANKS[b.rank].name} ».` });
  const claimable = goalStatuses(after, b).filter((g) => g.done && !g.claimed);
  if (claimable.length) notes.push({ tone: "good", text: `${claimable.length} subvention${claimable.length > 1 ? "s" : ""} à encaisser (${fmt(claimable.reduce((s, g) => s + g.goal.reward, 0))} €).` });
  if (after.cash < 0) notes.push({ tone: "bad", text: "Vos liquidités sont passées en négatif." });
  if (b.energy.balance < 0 && a.energy.balance >= 0) notes.push({ tone: "bad", text: "La ville manque maintenant d'énergie : elle en importe au prix fort." });
  if (b.food.balance < 0 && a.food.balance >= 0) notes.push({ tone: "bad", text: "La ville manque maintenant de nourriture : elle en importe au prix fort." });
  for (const id of SERVICE_IDS) if (b.services[id].needed && !a.services[id].needed && b.services[id].coverage < 1) notes.push({ tone: "bad", text: `Les habitants attendent désormais : ${SERVICES[id].label.toLowerCase()}.` });
  if (b.freeHousing === 0 && a.freeHousing > 0) notes.push({ tone: "info", text: "Tous les logements sont occupés : la population ne grandit plus." });
  if (b.wear >= 0.5 && a.wear < 0.5) notes.push({ tone: "bad", text: `La vétusté atteint ${Math.round(b.wear * 100)} % : pensez à rénover.` });
  if (b.unemploymentRate >= 0.08 && a.unemploymentRate < 0.08) notes.push({ tone: "bad", text: `Le chômage est monté à ${Math.round(b.unemploymentRate * 100)} %.` });
  const days = after.day - before.day;
  const flow = after.history.slice(-days).reduce((s, h, i, arr) => s + dayFlow(after.history, after.history.length - arr.length + i), 0);
  return {
    days, cityFlow: round2(flow),
    population: { from: before.population, to: after.population },
    rank: { from: a.rank, to: b.rank },
    satisfaction: { from: a.satisfaction, to: b.satisfaction },
    notes,
  };
}

/** Prestige : ce que la ville a accompli (rang, objectifs, grands projets). */
export function prestige(state: Pick<GameState, "population"> & Partial<Pick<GameState, "goals" | "projects">>): number {
  return cityRank(state.population) * PRESTIGE_PER_RANK + (state.goals?.length ?? 0) * PRESTIGE_PER_GOAL
    + PROJECTS.reduce((a, p) => a + (state.projects?.includes(p.id) ? p.prestige : 0), 0);
}

/** Remplace la liste des contrats par celle du serveur. */
export function setContracts(state: GameState, contracts: Contract[]): GameState {
  return JSON.stringify(state.contracts ?? []) === JSON.stringify(contracts) ? state : { ...state, contracts };
}

/** Nombre de titres qu'un montant en euros permet d'acheter ou de vendre (au dix-millième de titre, arrondi vers le bas). */
export function sharesFor(amount: number, price: number): number {
  return price > 0 && amount > 0 ? Math.floor((amount / price) * 10_000 + 1e-6) / 10_000 : 0;
}
/** Montant d'achat maximal avec ces liquidités, frais compris. */
export function maxBuyAmount(cash: number, factor = 1): number {
  return Math.max(0, Math.floor(Math.min(cash - TRADE_FEE_MIN, cash / (1 + TRADE_FEE_RATE * factor)) * 100) / 100);
}

export function buy(state: GameState, symbol: string, qty: number, price: number, at: number): ActionResult {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Quantité invalide." };
  if (!(price > 0)) return { ok: false, error: "Prix indisponible." };
  const need = ASSET_BY_SYMBOL[symbol]?.research;
  if (need && !hasResearch(state, need)) return { ok: false, error: `Débloquez d'abord « ${RESEARCH_BY_ID[need]?.name ?? need} » dans Recherche.` };
  const gross = round2(qty * price);
  const fee = tradeFee(gross, feeFactor(state, symbol));
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
      today: spend(state, "fees", fee),
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
  const fee = tradeFee(gross, feeFactor(state, symbol));
  const holdings = { ...state.holdings };
  const left = h.qty - qty;
  const gain = round2(gross - fee - qty * h.avgCost);
  if (left <= 1e-9) delete holdings[symbol];
  else holdings[symbol] = { qty: left, avgCost: h.avgCost };
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash + gross - fee),
      holdings,
      today: spend(state, "fees", fee),
      realized: round2((state.realized ?? 0) + gain),
      transactions: addTx(state, { kind: "sell", label: `Vente ${qty} × ${symbol}`, symbol, qty, price, amount: gross - fee, gain, at }),
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
  const plots = tile ? [...state.plots, { id: b.id, x: tile.x, y: tile.y }] : addPlot(state.plots, b.id, mapSize(state));
  if (plots.length === state.plots.length) return { ok: false, error: "Plus de place sur la carte : agrandissez le territoire." };
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
  // Perte de patrimoine : la valeur qui sort des actifs moins le remboursement (un bâtiment offert au départ ne compte pas).
  const loss = (count > (STARTING_BUILDINGS[b.id] ?? 0) ? b.cost : 0) - refund;
  const buildings = { ...state.buildings, [b.id]: count - 1 };
  if (buildings[b.id] === 0) delete buildings[b.id];
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash + refund,
      buildings,
      today: spend(state, "demolish", loss),
      plots: tile ? state.plots.filter((p) => !(p.x === tile.x && p.y === tile.y)) : removePlot(state.plots, b.id),
      transactions: addTx(state, { kind: "demolish", label: `Démolition : ${b.name}`, amount: refund, at }),
    },
  };
}

/** Version supérieure d'un bâtiment et prix à payer (un bâtiment offert au départ se paie au prix plein). */
export function upgradeOffer(state: Pick<GameState, "buildings">, buildingId: string): { to: string; cost: number } | null {
  const b = BUILDING_BY_ID[buildingId], to = BUILDING_BY_ID[UPGRADES[buildingId]];
  if (!b || !to) return null;
  const offered = (state.buildings[buildingId] ?? 0) <= (STARTING_BUILDINGS[buildingId] ?? 0);
  return { to: to.id, cost: to.cost - (offered ? 0 : b.cost) };
}

/** Améliore sur place le bâtiment du carreau `tile` (recherche « Rénovation urbaine »). */
export function upgrade(state: GameState, tile: { x: number; y: number }, at: number): ActionResult {
  const plot = state.plots.find((p) => p.x === tile.x && p.y === tile.y);
  if (!plot) return { ok: false, error: "Aucun bâtiment ici." };
  if (!hasResearch(state, "city_upgrade")) return { ok: false, error: "Débloquez d'abord « Rénovation urbaine » dans Recherche." };
  const offer = upgradeOffer(state, plot.id);
  if (!offer) return { ok: false, error: "Ce bâtiment n'a pas de version supérieure." };
  const from = BUILDING_BY_ID[plot.id], to = BUILDING_BY_ID[offer.to];
  if (to.unlockPop && state.population < to.unlockPop) return { ok: false, error: `${to.name} : débloqué à ${to.unlockPop} habitants.` };
  if (offer.cost > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  const buildings = { ...state.buildings, [from.id]: (state.buildings[from.id] ?? 0) - 1, [to.id]: (state.buildings[to.id] ?? 0) + 1 };
  if (buildings[from.id] <= 0) delete buildings[from.id];
  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash - offer.cost),
      buildings,
      plots: state.plots.map((p) => (p === plot ? { ...p, id: to.id } : p)),
      transactions: addTx(state, { kind: "build", label: `Amélioration : ${from.name} → ${to.name}`, amount: -offer.cost, at }),
    },
  };
}

/** Population et flux net attendus dans quelques jours si rien ne change (recherche « Prévisions de la ville »). */
export function forecast(state: CityInput, days = FORECAST_DAYS): { population: number; net: number; cash: number } {
  let population = state.population, cash = 0, wear = state.wear ?? 0;
  for (let i = 0; i < days; i++) {
    const c = computeCity({ ...state, population, wear });
    cash += c.net;
    population = Math.max(0, population + c.growth);
    wear = nextWear(wear, population);
  }
  return { population, net: computeCity({ ...state, population, wear }).net, cash };
}

/** Ce qu'un bâtiment rapporte et coûte réellement par jour dans la ville actuelle (recherche « Audit des bâtiments »). */
export function buildingAudit(buildingId: string, city: CityStats): { revenue: number; resources: number; maintenance: number; net: number; staffing: number } {
  const b = BUILDING_BY_ID[buildingId];
  const staffing = city.jobs > 0 ? city.employed / city.jobs : 0;
  const revenue = (b.revenue ?? 0) * staffing;
  // Une unité produite vaut le prix plein tant que la ville importe, le prix d'export sinon ; idem pour ce qui est consommé
  const unit = (balance: number, price: number) => (balance < 0 ? price : price * EXPORT_RATIO);
  const resources = ((b.energyProd ?? 0) - (b.energyUse ?? 0)) * unit(city.energy.balance, RESOURCE_PRICES.energy)
    + (b.foodProd ?? 0) * unit(city.food.balance, RESOURCE_PRICES.food);
  const maintenance = b.cost * MAINTENANCE_RATE;
  return { revenue, resources, maintenance, net: revenue + resources - maintenance, staffing };
}

// ─── Carte ────────────────────────────────────────────────────

export function isTileFree(state: Pick<GameState, "plots"> & Partial<Pick<GameState, "territory">>, x: number, y: number) {
  return isBuildable(x, y, mapSize(state)) && !state.plots.some((p) => p.x === x && p.y === y);
}

/** Déplace un bâtiment (gratuit). */
export function moveBuilding(state: GameState, from: { x: number; y: number }, to: { x: number; y: number }): ActionResult {
  const plot = state.plots.find((p) => p.x === from.x && p.y === from.y);
  if (!plot) return { ok: false, error: "Aucun bâtiment à déplacer ici." };
  if (from.x === to.x && from.y === to.y) return { ok: true, state };
  if (!isTileFree(state, to.x, to.y)) return { ok: false, error: "Emplacement occupé ou sur une route." };
  return { ok: true, state: { ...state, plots: state.plots.map((p) => p === plot ? { ...p, x: to.x, y: to.y } : p) } };
}

function addPlot(plots: Plot[], id: string, size: number): Plot[] {
  const t = placeTile(plots, id, size);
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
  // Une entreprise implantée = un bâtiment « branch » (les parties d'avant ce bâtiment n'en ont pas encore)
  const sites = state.branches?.length ?? 0;
  if ((state.buildings.branch ?? 0) !== sites) {
    const buildings: Record<string, number> = { ...state.buildings, branch: sites };
    if (!sites) delete buildings.branch;
    const old = Array.isArray(state.plots) ? state.plots : [];
    let fixed = [...old.filter((p) => p.id !== "branch"), ...old.filter((p) => p.id === "branch").slice(0, sites)];
    const kept = fixed.filter((p) => p.id === "branch");
    for (let i = kept.length; i < sites; i++) { const t = placeTile(fixed, "branch", mapSize(state)); if (t) fixed = [...fixed, { id: "branch", ...t }]; }
    state = { ...state, buildings, plots: fixed };
  }
  const plots = Array.isArray(state.plots) ? state.plots : [];
  const counts: Record<string, number> = {};
  for (const p of plots) counts[p.id] = (counts[p.id] ?? 0) + 1;
  const same = Object.keys({ ...counts, ...state.buildings }).every((k) => (counts[k] ?? 0) === (state.buildings[k] ?? 0));
  return same && Array.isArray(state.plots) ? state : { ...state, plots: layoutFrom(state.buildings, mapSize(state)) };
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
      today: spend(state, "research", n.cost),
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

export function createFolder(state: GameState, name: string, at: number, symbols: string[] = [], prices: Prices = {}): ActionResult {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Donnez un nom au dossier." };
  if (state.folders.length >= folderLimit(state)) return { ok: false, error: "Limite atteinte : recherchez « Dossiers illimités »." };
  const folder: Folder = { id: `f${at.toString(36)}${state.folders.length}`, name: clean, symbols: [...new Set(symbols)], notes: "", added: trackAdded(undefined, symbols, at, prices) };
  return { ok: true, state: { ...state, folders: [...state.folders, folder] } };
}

export function updateFolder(state: GameState, id: string, patch: Partial<Omit<Folder, "id" | "added">>, at = 0, prices: Prices = {}): ActionResult {
  if (!state.folders.some((f) => f.id === id)) return { ok: false, error: "Dossier introuvable." };
  return {
    ok: true,
    state: {
      ...state,
      folders: state.folders.map((f) => f.id !== id ? f : {
        ...f,
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 40) || f.name } : {}),
        ...(patch.symbols !== undefined ? { symbols: [...new Set(patch.symbols)], added: trackAdded(f.added, patch.symbols, at, prices) } : {}),
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
