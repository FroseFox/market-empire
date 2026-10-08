// Territoires du monde : les vrais pays (Natural Earth, via world-atlas).
// Chaque joueur installe sa ville dans un pays jouable. Un pays accueille plusieurs villes (CITIES_PER_COUNTRY),
// qui profitent toutes de sa spécialité ; des places financières neutres sont gérées par le jeu.

import { CITIES_PER_COUNTRY, COUNTRY_PRICES, FINANCE_FEE_FACTOR, SPECIALTY_BONUS, type Specialty } from "../game/config";

/** Pays jouables (code ISO numérique → nom français). */
export const PLAYABLE: Record<string, string> = {
  "124": "Canada", "840": "États-Unis", "484": "Mexique", "076": "Brésil", "032": "Argentine", "152": "Chili",
  "170": "Colombie", "604": "Pérou", "862": "Venezuela",
  "826": "Royaume-Uni", "250": "France", "724": "Espagne", "620": "Portugal", "276": "Allemagne", "380": "Italie",
  "528": "Pays-Bas", "056": "Belgique", "756": "Suisse", "040": "Autriche", "616": "Pologne", "752": "Suède",
  "578": "Norvège", "246": "Finlande", "208": "Danemark", "300": "Grèce", "792": "Turquie", "642": "Roumanie",
  "804": "Ukraine", "203": "Tchéquie", "348": "Hongrie", "372": "Irlande",
  "643": "Russie", "398": "Kazakhstan", "156": "Chine", "392": "Japon", "410": "Corée du Sud", "356": "Inde",
  "360": "Indonésie", "764": "Thaïlande", "704": "Viêt Nam", "458": "Malaisie", "608": "Philippines", "586": "Pakistan",
  "682": "Arabie saoudite", "784": "Émirats arabes unis", "376": "Israël", "818": "Égypte", "504": "Maroc",
  "012": "Algérie", "566": "Nigeria", "710": "Afrique du Sud", "404": "Kenya", "231": "Éthiopie", "288": "Ghana",
  "036": "Australie", "554": "Nouvelle-Zélande",
};
export const PLAYABLE_IDS = Object.keys(PLAYABLE);

/** Catégorie de prix (1 à 4) selon le poids économique du pays ; les pays non listés sont en catégorie 1. */
const TIERS: Record<number, string[]> = {
  4: ["840", "156", "392", "276"],
  3: ["826", "250", "356", "380", "124", "410", "076", "036", "643", "724"],
  2: ["484", "360", "528", "682", "792", "756", "616", "752", "056", "784", "578", "040", "372", "376", "764", "208", "458", "032"],
};
const TIER_OF: Record<string, number> = {};
for (const [tier, ids] of Object.entries(TIERS)) for (const id of ids) TIER_OF[id] = Number(tier);
export const countryTier = (id: string) => TIER_OF[id] ?? 1;
/** Prix pour installer sa ville dans ce pays. */
export const countryPrice = (id: string) => COUNTRY_PRICES[countryTier(id) - 1];

/** Ce qu'une place financière couvre : un bureau y réduit les frais de courtage sur ces actifs. */
export type HubScope = "us" | "europe" | "asia" | "world" | "etf" | "commodity";
export interface Hub { name: string; country: string; coords: [number, number]; specialty: string; population: number; scope: HubScope; covers: string }

/** Places financières neutres (non jouables), placées sur les vraies villes. */
export const HUBS: Hub[] = [
  { name: "New York", country: "840", coords: [-74.0, 40.7], specialty: "Finance", population: 8_300_000, scope: "us", covers: "Actions américaines" },
  { name: "Londres", country: "826", coords: [-0.13, 51.5], specialty: "Finance", population: 8_900_000, scope: "europe", covers: "Actions européennes" },
  { name: "Francfort", country: "276", coords: [8.68, 50.11], specialty: "Banque", population: 770_000, scope: "etf", covers: "ETF et indices" },
  { name: "Tokyo", country: "392", coords: [139.7, 35.68], specialty: "Industrie", population: 14_000_000, scope: "asia", covers: "Actions d'Asie" },
  { name: "Hong Kong", country: "156", coords: [114.17, 22.32], specialty: "Commerce maritime", population: 7_400_000, scope: "world", covers: "Actions du reste du monde" },
  { name: "Singapour", country: "702", coords: [103.82, 1.35], specialty: "Commerce maritime", population: 5_900_000, scope: "commodity", covers: "Matières premières" },
];

/** Nombre de villes par pays. `taken` = le pays de chaque joueur (un élément par joueur). */
export function countryCounts(taken: string[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const id of taken) if (id) n[id] = (n[id] ?? 0) + 1;
  return n;
}
/** Le pays n'accueille plus de nouvelle ville. */
export const countryFull = (id: string, taken: string[]) => (countryCounts(taken)[id] ?? 0) >= CITIES_PER_COUNTRY;

/** Pays d'un nouveau joueur, stable pour un même joueur : parmi les moins peuplés, pour remplir le monde de façon égale.
 *  Tant qu'il reste des pays vides, chacun reçoit donc le sien. */
export function pickCountry(uid: string, taken: string[]): string | null {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  const n = countryCounts(taken);
  const least = Math.min(...PLAYABLE_IDS.map((id) => n[id] ?? 0));
  const open = PLAYABLE_IDS.filter((id) => (n[id] ?? 0) === least);
  return open.length ? open[h % open.length] : null;
}

/** Tous les pays jouables, dans un ordre propre à chaque joueur (le serveur prend le moins peuplé, puis le premier de cet ordre). */
export function countryPreference(uid: string): string[] {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  const k = h % PLAYABLE_IDS.length;
  return [...PLAYABLE_IDS.slice(k), ...PLAYABLE_IDS.slice(0, k)];
}

/** Spécialité de chaque pays jouable (les pays non listés : commerce). */
const SPECIALTIES: Record<Specialty, string[]> = {
  finance: ["840", "826", "756", "372", "784"],
  industry: ["276", "156", "392", "410", "616", "203", "484", "704", "764", "348", "792"],
  energy: ["643", "682", "578", "124", "862", "398", "012", "566", "360"],
  agri: ["076", "032", "804", "554", "036", "404", "231", "288", "170", "604", "586", "642"],
  commerce: ["250", "724", "380", "300", "620", "504", "458", "608", "528", "056", "818"],
  services: ["356", "752", "246", "208", "040", "376", "710", "152"],
};
const SPECIALTY_OF: Record<string, Specialty> = {};
for (const [sp, ids] of Object.entries(SPECIALTIES)) for (const id of ids) SPECIALTY_OF[id] = sp as Specialty;
export const countrySpecialty = (id: string): Specialty => SPECIALTY_OF[id] ?? "commerce";
/** Bonus apporté par la spécialité du pays (plus fort dans un pays cher). */
export const countryBonus = (id: string) => SPECIALTY_BONUS[countryTier(id) - 1];
/** Ce que la spécialité d'un pays apporte, en clair. */
export function specialtyText(id: string): string {
  const pct = Math.round(countryBonus(id) * 100);
  switch (countrySpecialty(id)) {
    case "energy": return `Énergie : production +${pct} %`;
    case "agri": return `Agriculture : production +${pct} %`;
    case "industry": return `Industrie : revenus +${pct} %`;
    case "commerce": return `Commerce et tourisme : revenus +${pct} %`;
    case "services": return `Services : revenus +${pct} %`;
    case "finance": return `Finance : frais de courtage −${pct * FINANCE_FEE_FACTOR} %`;
  }
}
export const HUB_BY_NAME: Record<string, Hub> = Object.fromEntries(HUBS.map((h) => [h.name, h]));
