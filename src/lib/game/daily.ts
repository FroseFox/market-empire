// Missions du jour et série de jours de connexion (pur, testable).
// - Chaque jour (minuit, heure de Paris : le même pour tous les joueurs), trois missions tirées d'après la ville.
//   Le tirage dépend de la partie et de la date : recharger la page ou changer d'appareil ne le change pas.
// - Chaque mission réussie rapporte de l'argent ; les trois → un bonus.
// - La série compte les jours d'affilée où le joueur ouvre le jeu ; un cadeau par jour, plus gros quand la série s'allonge.
//   Un jour manqué casse la série, sauf avec un joker (gagné tous les 7 jours, un au plus).
// Les récompenses suivent la taille de la ville (son flux net d'un jour de ville).
// Aucune mission ne porte sur la bourse : le jeu ne pousse jamais à acheter ou à vendre.
import { BUILDINGS, CATEGORY_LABELS, type Category } from "./config";
import { RESEARCH } from "./research";
import { clamp, computeCity, grant, type CityStats, type GameState } from "./engine";

export type MissionKind = "build" | "buildCat" | "pop" | "joy" | "research" | "days";
export interface Mission {
  kind: MissionKind;
  /** Catégorie de bâtiment (mission « buildCat »). */
  cat?: Category;
  target: number;
  /** Valeur au moment du tirage : la mission compte ce qui est fait depuis. */
  base: number;
  reward: number;
  claimed?: boolean;
}
export interface DailyState {
  /** Jour (AAAA-MM-JJ, heure de Paris) des missions en cours. */
  date: string;
  missions: Mission[];
  /** Missions toutes faites : bonus encaissé. */
  bonus?: boolean;
  /** Récompense de base du jour (une mission = 2 fois, le bonus = 3 fois, le cadeau = 1 à 3 fois). */
  unit: number;
  /** Jours d'affilée où le jeu a été ouvert, record, jokers en réserve (0 ou 1). */
  streak: number;
  best: number;
  jokers: number;
  /** Un joker a sauvé la série aujourd'hui (pour le dire au joueur). */
  saved?: boolean;
  /** Cadeau du jour encaissé. */
  gift?: boolean;
}

export const DAILY = {
  missions: 3,
  missionUnits: 2,
  bonusUnits: 3,
  /** Unité de récompense : le flux net d'un jour de ville, entre ces bornes. */
  unitMin: 2_000,
  unitMax: 150_000,
  /** Cadeau : +25 % par jour de série, jusqu'à ×3. */
  giftStep: 0.25,
  giftMax: 3,
  jokerEvery: 7,
};

/** Date du jour à Paris (AAAA-MM-JJ) pour l'instant `at`. */
export function parisDate(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
/** Écart en jours entre deux dates AAAA-MM-JJ. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Lendemain d'une date AAAA-MM-JJ. */
export const nextDate = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** Instant (ms) où il est `hour` h à Paris le jour `date`. */
export function parisTime(date: string, hour: number): number {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(guess).map((p) => [p.type, p.value]));
  const seen = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return guess - (seen - guess); // décalage de Paris (1 ou 2 h selon la saison)
}
/** Rappel à programmer : le lendemain à 19 h, si la série vaut la peine d'être gardée. */
export function streakReminder(d: DailyState | undefined): { at: number; title: string; body: string } | null {
  if (!d || d.streak < 2) return null;
  return { at: parisTime(nextDate(d.date), 19), title: `Série de ${d.streak} jours`, body: "Ouvrez le jeu avant minuit pour la garder." };
}

// Tirage reproductible : même partie + même date = mêmes missions
function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296; };
}
const seedOf = (createdAt: number, date: string) => [...date].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16_777_619), Math.floor(createdAt / 1000) | 0);

const totalBuildings = (s: Pick<GameState, "buildings">) => Object.values(s.buildings).reduce((a, n) => a + n, 0);
const inCategory = (s: Pick<GameState, "buildings">, cat: Category) => BUILDINGS.filter((b) => b.category === cat).reduce((a, b) => a + (s.buildings[b.id] ?? 0), 0);
/** Catégories où le joueur peut construire quelque chose aujourd'hui (au moins un bâtiment débloqué). */
const openCategories = (s: Pick<GameState, "population">): Category[] =>
  (["housing", "commerce", "energy", "agriculture", "services", "industry"] as Category[])
    .filter((c) => BUILDINGS.some((b) => b.category === c && b.buildable !== false && (!b.unlockPop || s.population >= b.unlockPop)));
/** Une recherche est-elle à portée (toutes ses conditions remplies, pas encore faite) ? */
const researchOpen = (s: Pick<GameState, "research">) => RESEARCH.some((n) => !s.research.includes(n.id) && n.requires.every((r) => s.research.includes(r)));

/** Où en est une mission : valeur atteinte (à comparer à `target`). */
export function missionValue(m: Mission, s: GameState, city: CityStats = computeCity(s)): number {
  switch (m.kind) {
    case "build": return totalBuildings(s) - m.base;
    case "buildCat": return inCategory(s, m.cat!) - m.base;
    case "pop": return Math.floor(s.population - m.base);
    case "joy": return Math.round(city.satisfaction * 100);
    case "research": return s.research.length - m.base;
    case "days": return s.day - m.base;
  }
}
export function missionText(m: Mission): string {
  switch (m.kind) {
    case "build": return `Construire ${m.target} bâtiments`;
    case "buildCat": return `Construire un bâtiment « ${CATEGORY_LABELS[m.cat!]} »`;
    case "pop": return `Gagner ${m.target.toLocaleString("fr-FR")} habitants`;
    case "joy": return `Atteindre ${m.target} % de satisfaction`;
    case "research": return "Débloquer une recherche";
    case "days": return `Revenir dans ${m.target} heures (${m.target} jours de ville)`;
  }
}

export interface MissionStatus { mission: Mission; index: number; value: number; progress: number; done: boolean }
export function missionStatuses(s: GameState, city: CityStats = computeCity(s)): MissionStatus[] {
  return (s.daily?.missions ?? []).map((mission, index) => {
    const value = missionValue(mission, s, city);
    return { mission, index, value, progress: clamp(value / mission.target, 0, 1), done: value >= mission.target };
  });
}

/** Unité de récompense d'après la ville du moment. */
export const rewardUnit = (city: CityStats) => clamp(Math.round(city.net / 100) * 100, DAILY.unitMin, DAILY.unitMax);
/** Cadeau du jour pour une série de `streak` jours. */
export const giftFor = (unit: number, streak: number) => Math.round(unit * Math.min(DAILY.giftMax, 1 + DAILY.giftStep * Math.max(0, streak - 1)));

/** Tire les missions du jour d'après la ville. */
export function rollMissions(s: GameState, date: string, city: CityStats, unit: number): Mission[] {
  const r = rng(seedOf(s.createdAt, date));
  const pool: Omit<Mission, "reward">[] = [];
  const n = totalBuildings(s);
  pool.push({ kind: "build", target: n < 30 ? 2 : 3, base: n });
  const cats = openCategories(s);
  if (cats.length) { const cat = cats[Math.floor(r() * cats.length)]; pool.push({ kind: "buildCat", cat, target: 1, base: inCategory(s, cat) }); }
  pool.push({ kind: "pop", target: Math.max(30, Math.round((s.population * 0.04) / 10) * 10), base: Math.floor(s.population) });
  const joy = Math.round(city.satisfaction * 100);
  if (joy < 95) pool.push({ kind: "joy", target: Math.min(95, joy + 3), base: joy });
  if (researchOpen(s)) pool.push({ kind: "research", target: 1, base: s.research.length });
  pool.push({ kind: "days", target: 3, base: s.day });
  // Trois missions différentes, au hasard (mélange de Fisher-Yates)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, DAILY.missions).map((m) => ({ ...m, reward: unit * DAILY.missionUnits }));
}

/** Nouveau jour : tire les missions et met la série à jour. Sans effet si le jour n'a pas changé. */
export function refreshDaily(s: GameState, date: string): GameState {
  const prev = s.daily;
  if (prev?.date === date) return s;
  const city = computeCity(s), unit = rewardUnit(city);
  let streak = 1, jokers = prev?.jokers ?? 0, saved = false;
  if (prev) {
    const gap = daysBetween(prev.date, date);
    if (gap === 1) streak = prev.streak + 1;
    else if (gap === 2 && jokers > 0) { streak = prev.streak + 1; jokers--; saved = true; }
    else if (gap <= 0) streak = prev.streak; // horloge revenue en arrière : on ne punit pas
  }
  if (streak % DAILY.jokerEvery === 0) jokers = 1;
  return {
    ...s,
    daily: { date, missions: rollMissions(s, date, city, unit), unit, streak, best: Math.max(prev?.best ?? 0, streak), jokers, ...(saved ? { saved } : {}) },
  };
}

export type DailyResult = { ok: true; state: GameState; amount: number } | { ok: false; error: string };

/** Encaisse la récompense d'une mission réussie. */
export function claimMission(s: GameState, index: number, at: number): DailyResult {
  const st = missionStatuses(s)[index];
  if (!st || !s.daily) return { ok: false, error: "Mission inconnue." };
  if (st.mission.claimed) return { ok: false, error: "Récompense déjà encaissée." };
  if (!st.done) return { ok: false, error: "Mission pas encore réussie." };
  const missions = s.daily.missions.map((m, i) => (i === index ? { ...m, claimed: true } : m));
  const amount = st.mission.reward;
  return { ok: true, amount, state: { ...grant(s, amount, `Mission du jour : ${missionText(st.mission)}`, at), daily: { ...s.daily, missions } } };
}

/** Bonus des trois missions (toutes encaissées). */
export function claimBonus(s: GameState, at: number): DailyResult {
  const d = s.daily;
  if (!d) return { ok: false, error: "Pas de missions aujourd'hui." };
  if (d.bonus) return { ok: false, error: "Bonus déjà encaissé." };
  if (!d.missions.length || d.missions.some((m) => !m.claimed)) return { ok: false, error: "Terminez d'abord les trois missions." };
  const amount = d.unit * DAILY.bonusUnits;
  return { ok: true, amount, state: { ...grant(s, amount, "Missions du jour : bonus", at), daily: { ...d, bonus: true } } };
}

/** Cadeau du jour de la série. */
export function claimGift(s: GameState, at: number): DailyResult {
  const d = s.daily;
  if (!d) return { ok: false, error: "Pas de cadeau aujourd'hui." };
  if (d.gift) return { ok: false, error: "Cadeau déjà encaissé." };
  const amount = giftFor(d.unit, d.streak);
  return { ok: true, amount, state: { ...grant(s, amount, `Cadeau du jour (série de ${d.streak} jour${d.streak > 1 ? "s" : ""})`, at), daily: { ...d, gift: true, saved: false } } };
}
