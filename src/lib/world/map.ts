// Carte du monde, générée une fois pour toutes (mêmes régions pour tous les joueurs).
// Grille hexagonale « pointe en haut », continents par bruit, régions par proximité.

export const COLS = 30, ROWS = 18;
export const HEX = 16; // rayon d'un hexagone (px)
const SQ3 = Math.sqrt(3);

export interface Hex { q: number; r: number; x: number; y: number; region: number }
export interface Region { id: number; name: string; hexes: number; cx: number; cy: number; neutral?: NeutralCity }
export interface NeutralCity { name: string; specialty: string; population: number }

function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const center = (col: number, row: number) => ({ x: HEX * SQ3 * (col + 0.5 * (row & 1)) + HEX * SQ3 / 2 + 8, y: HEX * 1.5 * row + HEX + 8 });
export const WIDTH = Math.ceil(HEX * SQ3 * (COLS + 0.5) + 16);
export const HEIGHT = Math.ceil(HEX * 1.5 * (ROWS - 1) + HEX * 2 + 16);

export function hexPoints(x: number, y: number, r = HEX) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const NEUTRALS: NeutralCity[] = [
  { name: "Port-Azur", specialty: "Commerce maritime", population: 42_000 },
  { name: "Nordhavn", specialty: "Énergie", population: 28_000 },
  { name: "Solaria", specialty: "Agriculture", population: 35_000 },
  { name: "Kerava", specialty: "Industrie", population: 51_000 },
  { name: "Montclair", specialty: "Finance", population: 64_000 },
  { name: "Valmira", specialty: "Technologie", population: 38_000 },
];
const REGION_NAMES = [
  "Baie d'Argent", "Hautes-Plaines", "Val Doré", "Cap Nord", "Terres Rouges", "Côte d'Ambre", "Plateau Vert", "Rives de l'Est",
  "Monts Clairs", "Delta Bleu", "Presqu'île Sud", "Collines d'Or", "Grand Ouest", "Marches du Nord", "Vallée Haute", "Îles Basses",
  "Pointe Sable", "Forêt Grise", "Lande Claire", "Côte Sauvage", "Bassin Central", "Crêtes Blanches", "Golfe Calme", "Terres Neuves",
];
export const REGION_COUNT = 24;

function build() {
  // 1. Terres émergées
  const land: { col: number; row: number }[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nx = col / COLS, ny = row / ROWS;
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny); // mer sur les bords
      const n = noise(col / 7, row / 5, 3) * 0.65 + noise(col / 3, row / 2.5, 9) * 0.35;
      if (n - Math.max(0, 0.16 - edge) * 3 > 0.42) land.push({ col, row });
    }
  }
  // 2. Graines des régions : échantillonnage « le plus éloigné » (déterministe)
  const seeds: { col: number; row: number }[] = [land[Math.floor(land.length / 2)]];
  const dist = (a: { col: number; row: number }, b: { col: number; row: number }) => {
    const pa = center(a.col, a.row), pb = center(b.col, b.row);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  };
  while (seeds.length < REGION_COUNT) {
    let best = land[0], bestD = -1;
    for (const h of land) {
      const d = Math.min(...seeds.map((sd) => dist(h, sd)));
      if (d > bestD) { bestD = d; best = h; }
    }
    seeds.push(best);
  }
  // 3. Chaque hexagone rejoint la graine la plus proche
  const hexes: Hex[] = land.map(({ col, row }) => {
    let region = 0, bd = Infinity;
    seeds.forEach((sd, i) => { const d = dist({ col, row }, sd); if (d < bd) { bd = d; region = i; } });
    const { x, y } = center(col, row);
    return { q: col, r: row, x, y, region };
  });
  const regions: Region[] = seeds.map((_, id) => {
    const hs = hexes.filter((h) => h.region === id);
    return {
      id,
      name: REGION_NAMES[id % REGION_NAMES.length],
      hexes: hs.length,
      cx: hs.reduce((a, h) => a + h.x, 0) / Math.max(1, hs.length),
      cy: hs.reduce((a, h) => a + h.y, 0) / Math.max(1, hs.length),
    };
  });
  // 4. Cités neutres : les 6 plus grandes régions (un pour quatre)
  [...regions].sort((a, b) => b.hexes - a.hexes).filter((_, i) => i % 4 === 1).slice(0, NEUTRALS.length)
    .forEach((reg, i) => { reg.neutral = NEUTRALS[i]; });
  const byKey = new Map(hexes.map((h) => [`${h.q},${h.r}`, h]));
  return { hexes, regions, byKey };
}

export const WORLD = build();

/** Voisins d'un hexagone (grille décalée, lignes impaires décalées à droite). */
export function neighborsOf(q: number, r: number): [number, number][] {
  const odd = r & 1;
  return odd
    ? [[q + 1, r], [q - 1, r], [q, r - 1], [q + 1, r - 1], [q, r + 1], [q + 1, r + 1]]
    : [[q + 1, r], [q - 1, r], [q - 1, r - 1], [q, r - 1], [q - 1, r + 1], [q, r + 1]];
}

/** Région libre pour un nouveau joueur (ni cité neutre, ni déjà prise). */
export function pickRegion(uid: string, taken: number[]): number | null {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  const free = WORLD.regions.filter((r) => !r.neutral && !taken.includes(r.id));
  if (!free.length) return null;
  return free[h % free.length].id;
}
