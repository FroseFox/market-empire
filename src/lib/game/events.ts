// Événements de ville : une fois par semaine, le jeu regarde la ville et décide s'il lui arrive quelque chose
// (un coup de pouce, une catastrophe naturelle, ou rien). Aucune IA payante : des règles qui pèsent chaque
// événement d'après l'état réel de la ville, plus une part de hasard.
// Ces événements ne touchent QUE la ville : jamais les cours de bourse, qui restent ceux du vrai marché.
import type { ServiceId } from "./config";
import type { CityStats } from "./engine";

/** Un jour de ville = une heure réelle : 168 jours de ville font une semaine. */
export const EVENTS = {
  /** Un événement est décidé tous les `every` jours de ville. */
  every: 168,
  /** Durée des effets, en jours de ville (24 = un jour réel). */
  duration: 24,
  /** Chances qu'il ne se passe rien cette semaine. */
  quiet: 0.25,
  /** Quand il se passe quelque chose : part de coups de pouce (le reste : des catastrophes).
   *  Elle monte avec la satisfaction : une ville bien tenue a plus de chance, de 35 % à 65 %. */
  bonusBase: 0.35,
  bonusPerSatisfaction: 0.3,
  /** Un équipement qui couvre toute la ville divise par deux la force d'une catastrophe. */
  guardCut: 0.5,
};

/** Ce qu'un événement change pendant sa durée. Les multiplicateurs valent 1 quand ils sont absents. */
export interface EventEffect {
  energy?: number;       // production d'énergie
  food?: number;         // production de nourriture
  revenue?: number;      // revenus des bâtiments (hors tourisme)
  tourism?: number;      // revenus du tourisme
  maintenance?: number;  // entretien
  growth?: number;       // nouveaux habitants
  satisfaction?: number; // points de satisfaction (0,02 = +2 points)
  /** Versé une seule fois, au début : ce nombre de jours du flux net de la ville. */
  cashDays?: number;
}

export interface CityEventDef {
  id: string;
  name: string;
  kind: "bonus" | "disaster";
  /** Ce qui se passe, en une phrase. */
  text: string;
  effect: EventEffect;
  /** Équipement public qui atténue la catastrophe. */
  guard?: ServiceId;
  /** Chances que l'événement arrive dans CETTE ville (0 = impossible). */
  weight: (c: CityStats) => number;
}

export const CITY_EVENTS: CityEventDef[] = [
  // ── Coups de pouce ──
  { id: "festival", name: "Festival de la ville", kind: "bonus", text: "Les visiteurs affluent : le tourisme rapporte plus.",
    effect: { tourism: 1.5, satisfaction: 0.02 }, weight: (c) => (c.tourism.revenue > 0 ? 2 + c.satisfaction * 2 : 0) },
  { id: "harvest", name: "Récolte exceptionnelle", kind: "bonus", text: "Les exploitations produisent bien plus de nourriture.",
    effect: { food: 1.3 }, weight: (c) => (c.food.prod > 0 ? 1.5 + (c.food.balance > 0 ? 1 : 0) : 0) },
  { id: "fair", name: "Salon des entreprises", kind: "bonus", text: "Les affaires marchent fort : les bâtiments rapportent plus.",
    effect: { revenue: 1.15 }, weight: (c) => (c.income.buildings > 0 ? 1 + (1 - c.unemploymentRate) * 1.5 : 0) },
  { id: "newcomers", name: "Vague de nouveaux habitants", kind: "bonus", text: "La ville attire : les arrivées doublent.",
    effect: { growth: 2 }, weight: (c) => (c.freeHousing > 0 ? 1 + c.satisfaction * 1.5 : 0) },
  { id: "grant", name: "Aide exceptionnelle de la région", kind: "bonus", text: "La région récompense une ville bien tenue par une aide versée d'un coup.",
    effect: { cashDays: 3 }, weight: (c) => (c.satisfaction >= 0.8 ? 2 : 0.4) },
  // ── Catastrophes ──
  { id: "storm", name: "Tempête", kind: "disaster", text: "Le réseau électrique est endommagé : la production d'énergie chute.",
    effect: { energy: 0.7 }, guard: "safety", weight: (c) => (c.energy.prod > 0 ? 1.5 : 0) },
  { id: "drought", name: "Sécheresse", kind: "disaster", text: "Les cultures souffrent : la production de nourriture chute.",
    effect: { food: 0.6 }, weight: (c) => (c.food.prod > 0 ? 1.5 : 0) },
  { id: "flood", name: "Inondation", kind: "disaster", text: "Il faut tout remettre en état : l'entretien double.",
    effect: { maintenance: 2 }, guard: "safety", weight: () => 1.2 },
  { id: "strike", name: "Grève", kind: "disaster", text: "Le mécontentement gagne : les bâtiments rapportent moins.",
    effect: { revenue: 0.8 }, weight: (c) => 0.3 + (1 - c.satisfaction) * 5 },
  { id: "epidemic", name: "Épidémie", kind: "disaster", text: "Les habitants tombent malades : moins d'arrivées, satisfaction en baisse.",
    effect: { growth: 0.3, satisfaction: -0.06 }, guard: "hospital", weight: (c) => 0.6 + (c.services.hospital.needed && c.services.hospital.coverage < 1 ? 2 : 0) },
  { id: "smog", name: "Pic de pollution", kind: "disaster", text: "L'air est irrespirable : les touristes fuient, les habitants râlent.",
    effect: { tourism: 0.7, satisfaction: -0.05 }, weight: (c) => c.pollution.penalty * 40 },
];
export const EVENT_BY_ID: Record<string, CityEventDef> = Object.fromEntries(CITY_EVENTS.map((e) => [e.id, e]));

/** Événement en cours dans une partie : `until` = jour de ville où ses effets s'arrêtent, `strength` = force (0 à 1). */
export interface CityEvent { id: string; until: number; strength: number }

/** Hasard reproductible : même graine, même tirage (pour qu'une semaine donne le même résultat sur tous les appareils). */
function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Force d'une catastrophe dans cette ville : un équipement qui la couvre entièrement l'atténue de moitié. */
export function eventStrength(def: CityEventDef, c: CityStats): number {
  return def.guard ? 1 - EVENTS.guardCut * c.services[def.guard].coverage : 1;
}

/** Décide de l'événement de la semaine d'après l'état de la ville. `null` = il ne se passe rien.
 *  D'abord le genre (rien, coup de pouce ou catastrophe : une ville satisfaite a plus de chance), puis l'événement
 *  lui-même, tiré selon des poids qui dépendent de la ville. `force` écarte le « rien » (mode test). */
export function pickEvent(c: CityStats, seed: number, force = false): CityEventDef | null {
  const rand = rng(seed);
  for (let i = 0; i < 3; i++) rand();
  const roll = rand(), quiet = force ? 0 : EVENTS.quiet;
  if (roll < quiet) return null;
  const bonusShare = EVENTS.bonusBase + EVENTS.bonusPerSatisfaction * Math.min(1, Math.max(0, c.satisfaction));
  const kind: CityEventDef["kind"] = (roll - quiet) / (1 - quiet) < bonusShare ? "bonus" : "disaster";
  const weighted = (k: CityEventDef["kind"]) => CITY_EVENTS.filter((e) => e.kind === k).map((def) => ({ def, w: Math.max(0, def.weight(c)) })).filter((x) => x.w > 0);
  let pool = weighted(kind);
  if (!pool.length) pool = weighted(kind === "bonus" ? "disaster" : "bonus");
  let at = rand() * pool.reduce((a, x) => a + x.w, 0);
  for (const x of pool) { at -= x.w; if (at <= 0) return x.def; }
  return pool.at(-1)?.def ?? null;
}

/** Effet réel d'un événement à une force donnée (un multiplicateur de 0,7 à force 0,5 devient 0,85). */
export function scaledEffect(def: CityEventDef, strength: number): Required<Omit<EventEffect, "cashDays">> {
  const m = (v?: number) => 1 + ((v ?? 1) - 1) * strength;
  const e = def.effect;
  return { energy: m(e.energy), food: m(e.food), revenue: m(e.revenue), tourism: m(e.tourism), maintenance: m(e.maintenance), growth: m(e.growth), satisfaction: (e.satisfaction ?? 0) * strength };
}

/** Ce que l'événement change, en clair, à cette force. */
export function effectText(def: CityEventDef, strength = 1): string {
  const e = scaledEffect(def, strength), out: string[] = [];
  const pct = (v: number) => `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))} %`;
  if (e.energy !== 1) out.push(`énergie produite ${pct(e.energy)}`);
  if (e.food !== 1) out.push(`nourriture produite ${pct(e.food)}`);
  if (e.revenue !== 1) out.push(`revenus des bâtiments ${pct(e.revenue)}`);
  if (e.tourism !== 1) out.push(`tourisme ${pct(e.tourism)}`);
  if (e.maintenance !== 1) out.push(`entretien ${pct(e.maintenance)}`);
  if (e.growth !== 1) out.push(`nouveaux habitants ${pct(e.growth)}`);
  if (e.satisfaction) out.push(`satisfaction ${e.satisfaction > 0 ? "+" : "−"}${Math.abs(Math.round(e.satisfaction * 100))} pts`);
  if (def.effect.cashDays) out.push(`${def.effect.cashDays} jours de flux net versés d'un coup`);
  return out.join(", ");
}
