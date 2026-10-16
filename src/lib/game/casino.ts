// Casino de la ville (pur, testable) : roulette, machine à sous et crash, joués avec les liquidités du jeu.
// Aucun argent réel : on ne mise que l'argent virtuel de la partie, qui ne s'achète pas.
// - Il se débloque en construisant un bâtiment Casino ; l'améliorer relève la mise maximale et les plafonds du jour.
// - Plafonds par jour réel (minuit à Paris) : total misé, et gain net. Le gain net est aussi limité selon la valeur de la
//   partie, pour qu'une bonne série ne fasse jamais refuser la sauvegarde par l'anti-triche du serveur
//   (qui refuse une valeur qui fait plus que doubler en un jour, +150 000 € de marge).
// - Chaque jeu rend en moyenne un peu moins que la mise (avantage de la maison), comme un vrai casino.
import type { GameState } from "./engine";
import { parisDate } from "./daily";

export type CasinoGame = "roulette" | "slots" | "crash";

export interface CasinoTier { id: string; level: number; maxBet: number; dayStake: number; dayWin: number }
/** Du plus petit au plus grand : le meilleur casino de la ville fixe les limites. */
export const CASINO_TIERS: CasinoTier[] = [
  { id: "casino", level: 1, maxBet: 2_000, dayStake: 25_000, dayWin: 60_000 },
  { id: "casino_m", level: 2, maxBet: 10_000, dayStake: 120_000, dayWin: 300_000 },
  { id: "casino_l", level: 3, maxBet: 40_000, dayStake: 500_000, dayWin: 1_000_000 },
];
export const CASINO_IDS = CASINO_TIERS.map((t) => t.id);
/** Gain net du jour, au plus : socle + part de la valeur de la partie (liquidités + placements) au début du jour. */
export const CASINO_SAFE = { floor: 60_000, share: 0.5 };
export const MIN_BET = 10;

/** Suivi du jour (remis à zéro à minuit, heure de Paris). */
export interface CasinoDay {
  date: string;
  /** Total misé aujourd'hui. */
  staked: number;
  /** Gains moins mises, aujourd'hui (négatif = perdu). */
  net: number;
  /** Valeur de la partie à la première mise du jour (fixe le plafond de gain). */
  worth: number;
  /** Nombre de parties jouées aujourd'hui. */
  plays: number;
}

/** Niveau de casino de la ville (le meilleur bâtiment construit), ou null s'il n'y en a pas. */
export function casinoTier(state: Pick<GameState, "buildings">): CasinoTier | null {
  let best: CasinoTier | null = null;
  for (const t of CASINO_TIERS) if ((state.buildings[t.id] ?? 0) > 0) best = t;
  return best;
}

/** Suivi du jour courant (un nouveau jour repart de zéro). */
export function casinoDay(state: Pick<GameState, "casino">, at: number): CasinoDay | null {
  const d = state.casino;
  return d && d.date === parisDate(at) ? d : null;
}

/** Limites restantes pour aujourd'hui. `worth` = valeur actuelle de la partie (sert si c'est la première mise du jour). */
export function casinoLimits(state: Pick<GameState, "buildings" | "casino">, at: number, worth: number) {
  const tier = casinoTier(state);
  if (!tier) return null;
  const day = casinoDay(state, at);
  const base = day?.worth ?? worth;
  const winCap = Math.floor(Math.min(tier.dayWin, CASINO_SAFE.floor + CASINO_SAFE.share * Math.max(0, base)));
  const staked = day?.staked ?? 0, net = day?.net ?? 0;
  return {
    tier,
    maxBet: tier.maxBet,
    stakeLeft: Math.max(0, tier.dayStake - staked),
    winCap,
    winLeft: Math.max(0, winCap - net),
    staked, net, plays: day?.plays ?? 0,
  };
}

// ─── Roulette (européenne : 37 cases, de 0 à 36) ───
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type RouletteBet =
  | { kind: "red" } | { kind: "black" } | { kind: "even" } | { kind: "odd" } | { kind: "low" } | { kind: "high" }
  | { kind: "dozen"; n: 1 | 2 | 3 } | { kind: "number"; n: number };
/** Multiplicateur rendu (mise comprise) si le pari gagne. */
export function roulettePays(bet: RouletteBet): number {
  return bet.kind === "number" ? 36 : bet.kind === "dozen" ? 3 : 2;
}
export function rouletteWins(bet: RouletteBet, n: number): boolean {
  if (bet.kind === "number") return n === bet.n;
  if (n === 0) return false;
  switch (bet.kind) {
    case "red": return RED.has(n);
    case "black": return !RED.has(n);
    case "even": return n % 2 === 0;
    case "odd": return n % 2 === 1;
    case "low": return n <= 18;
    case "high": return n >= 19;
    case "dozen": return Math.ceil(n / 12) === bet.n;
  }
}

// ─── Machine à sous (3 rouleaux identiques) ───
export type Symbol = "cherry" | "lemon" | "bell" | "bar" | "coin" | "seven";
export const SLOT_WEIGHTS: Record<Symbol, number> = { cherry: 9, lemon: 9, bell: 6, bar: 4, coin: 2, seven: 1 };
/** Trois symboles identiques : multiplicateur rendu. Deux cerises (sans la troisième) : ×2. */
export const SLOT_TRIPLE: Record<Symbol, number> = { cherry: 6, lemon: 7, bell: 18, bar: 45, coin: 120, seven: 300 };
export const SLOT_TWO_CHERRIES = 2;
const SLOT_SYMBOLS = Object.keys(SLOT_WEIGHTS) as Symbol[];
const SLOT_TOTAL = SLOT_SYMBOLS.reduce((s, k) => s + SLOT_WEIGHTS[k], 0);
export function slotSymbol(u: number): Symbol {
  let x = u * SLOT_TOTAL;
  for (const s of SLOT_SYMBOLS) { x -= SLOT_WEIGHTS[s]; if (x < 0) return s; }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1];
}
export function slotPays(r: Symbol[]): number {
  if (r[0] === r[1] && r[1] === r[2]) return SLOT_TRIPLE[r[0]];
  return r.filter((s) => s === "cherry").length === 2 ? SLOT_TWO_CHERRIES : 0;
}

// ─── Crash : la courbe monte, on gagne si elle dépasse la cible choisie avant de s'effondrer ───
export const CRASH = { edge: 0.97, minTarget: 1.1, maxTarget: 20, maxPoint: 100 };
/** Point d'effondrement : P(point ≥ m) = 0,97 / m. */
export function crashPoint(u: number): number {
  const p = CRASH.edge / Math.max(1e-9, 1 - u);
  return Math.max(1, Math.min(CRASH.maxPoint, Math.floor(p * 100) / 100));
}

export type CasinoChoice =
  | { game: "roulette"; bet: RouletteBet }
  | { game: "slots" }
  | { game: "crash"; target: number };

export type CasinoOutcome =
  | { game: "roulette"; n: number }
  | { game: "slots"; reels: Symbol[] }
  | { game: "crash"; point: number; target: number };

export interface CasinoResult {
  ok: true; state: GameState; outcome: CasinoOutcome;
  bet: number; payout: number; won: boolean;
  /** Le gain a été réduit au plafond du jour. */
  capped: boolean;
}

/**
 * Joue une partie : mise `bet` euros. `rng` renvoie un nombre dans [0, 1) (Math.random en jeu, fixé dans les tests).
 * `worth` = valeur actuelle de la partie (liquidités + placements), pour le plafond de gain.
 */
export function playCasino(state: GameState, choice: CasinoChoice, bet: number, at: number, worth: number, rng: () => number = Math.random): CasinoResult | { ok: false; error: string } {
  const lim = casinoLimits(state, at, worth);
  if (!lim) return { ok: false, error: "Construisez d'abord un casino dans votre ville." };
  bet = Math.floor(bet);
  if (!(bet >= MIN_BET)) return { ok: false, error: `Mise minimale : ${MIN_BET} €.` };
  if (bet > lim.maxBet) return { ok: false, error: `Mise maximale de votre casino : ${lim.maxBet.toLocaleString("fr-FR")} €. Améliorez-le pour miser plus.` };
  if (bet > state.cash) return { ok: false, error: "Liquidités insuffisantes." };
  if (bet > lim.stakeLeft) return { ok: false, error: lim.stakeLeft > 0 ? `Il ne vous reste que ${lim.stakeLeft.toLocaleString("fr-FR")} € à miser aujourd'hui.` : "Limite de mises du jour atteinte : revenez demain." };
  if (lim.winLeft <= 0) return { ok: false, error: "Plafond de gains du jour atteint : le casino vous attend demain." };

  let mult: number, outcome: CasinoOutcome;
  if (choice.game === "roulette") {
    if (choice.bet.kind === "number" && !(Number.isInteger(choice.bet.n) && choice.bet.n >= 0 && choice.bet.n <= 36)) return { ok: false, error: "Numéro de 0 à 36." };
    const n = Math.min(36, Math.floor(rng() * 37));
    mult = rouletteWins(choice.bet, n) ? roulettePays(choice.bet) : 0;
    outcome = { game: "roulette", n };
  } else if (choice.game === "slots") {
    const reels = [slotSymbol(rng()), slotSymbol(rng()), slotSymbol(rng())];
    mult = slotPays(reels);
    outcome = { game: "slots", reels };
  } else {
    const target = Math.round(choice.target * 100) / 100;
    if (!(target >= CRASH.minTarget && target <= CRASH.maxTarget)) return { ok: false, error: `Cible entre ×${CRASH.minTarget} et ×${CRASH.maxTarget}.` };
    const point = crashPoint(rng());
    mult = point >= target ? target : 0;
    outcome = { game: "crash", point, target };
  }

  // Gain net limité à ce qu'il reste du plafond du jour
  let payout = Math.floor(bet * mult), capped = false;
  if (payout - bet > lim.winLeft) { payout = bet + lim.winLeft; capped = true; }
  const day = casinoDay(state, at) ?? { date: parisDate(at), staked: 0, net: 0, worth: Math.max(0, Math.floor(worth)), plays: 0 };
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    ok: true,
    outcome, bet, payout, won: payout > bet, capped,
    state: {
      ...state,
      cash: round2(state.cash - bet + payout),
      casino: { ...day, staked: day.staked + bet, net: day.net + payout - bet, plays: day.plays + 1 },
    },
  };
}
