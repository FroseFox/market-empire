// Territoires du monde : les vrais pays (Natural Earth, via world-atlas).
// Chaque joueur reçoit un pays jouable ; des places financières neutres sont gérées par le jeu.

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

export interface Hub { name: string; country: string; coords: [number, number]; specialty: string; population: number }

/** Places financières neutres (non jouables), placées sur les vraies villes. */
export const HUBS: Hub[] = [
  { name: "New York", country: "840", coords: [-74.0, 40.7], specialty: "Finance", population: 8_300_000 },
  { name: "Londres", country: "826", coords: [-0.13, 51.5], specialty: "Finance", population: 8_900_000 },
  { name: "Francfort", country: "276", coords: [8.68, 50.11], specialty: "Banque", population: 770_000 },
  { name: "Tokyo", country: "392", coords: [139.7, 35.68], specialty: "Industrie", population: 14_000_000 },
  { name: "Hong Kong", country: "156", coords: [114.17, 22.32], specialty: "Commerce maritime", population: 7_400_000 },
  { name: "Singapour", country: "702", coords: [103.82, 1.35], specialty: "Commerce maritime", population: 5_900_000 },
];

/** Pays libre pour un nouveau joueur, stable pour un même joueur. */
export function pickCountry(uid: string, taken: string[]): string | null {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  const free = PLAYABLE_IDS.filter((id) => !taken.includes(id));
  return free.length ? free[h % free.length] : null;
}
