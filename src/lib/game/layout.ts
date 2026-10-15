// Placement automatique des bâtiments sur la carte (pas de micro-gestion) :
// centre-ville résidentiel et commercial, industrie et énergie à l'est,
// agriculture au sud. Les routes quadrillent la carte tous les 5 carreaux : îlots de 4 × 4, où tiennent
// seize bâtiments d'un carreau, quatre de 2 × 2 ou un de 4 × 4 (avant : îlots de 3 × 3, où un 2 × 2 gâchait cinq carreaux).
import { BUILDING_BY_ID, type Category } from "./config";

/** Un bâtiment posé : `x`, `y` = son carreau d'angle (le plus petit x et le plus petit y), `s` = côté de son terrain
 *  en carreaux (1 si absent). Les bâtiments posés avant les tailles gardent un seul carreau. */
export interface Plot { id: string; x: number; y: number; s?: number }
export const sideOf = (p: Plot) => p.s ?? 1;
/** Côté du terrain que demande un bâtiment neuf de ce type. */
export const footprint = (id: string) => BUILDING_BY_ID[id]?.size ?? 1;
/** Chaque carreau occupé, relié à son bâtiment. */
export function occupancy(plots: Plot[]): Map<string, Plot> {
  const m = new Map<string, Plot>();
  for (const p of plots) { const s = sideOf(p); for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) m.set(`${p.x + dx},${p.y + dy}`, p); }
  return m;
}
/** Bâtiment qui occupe ce carreau (son angle ou n'importe lequel de ses carreaux). */
export const plotAt = (plots: Plot[], x: number, y: number) => plots.find((p) => x >= p.x && y >= p.y && x < p.x + sideOf(p) && y < p.y + sideOf(p));

/** Centre de la carte : deux grandes routes s'y croisent (elles relient la ville à l'extérieur). */
export const CENTER = 16;
/** Une route tous les `GRID` carreaux. */
export const GRID = 5;
/** Côté d'une carte de taille moyenne (repère par défaut) et de la plus grande. Les côtés sont impairs : une route
 *  borde la carte de chaque côté (voir TERRITORY dans config). */
export const MAP_SIZE = 41;
export const MAX_MAP_SIZE = 61;
/** Limites d'une carte de côté `size`, centrée sur CENTER : carreaux de `lo` à `hi - 1`. */
export function mapBounds(size = MAP_SIZE): { lo: number; hi: number } {
  const lo = CENTER - Math.floor(size / 2);
  return { lo, hi: lo + size };
}

/** Position d'un carreau dans la grille : 0 = sur une route, 1 à 4 = dans l'îlot. */
const cell = (v: number) => ((((v - CENTER) % GRID) + GRID) % GRID);
/** Ligne de route (en x ou en y). */
export const onRoadLine = (v: number) => cell(v) === 0;
export const isRoad = (x: number, y: number) => onRoadLine(x) || onRoadLine(y);
/** Numéro d'îlot (en x ou en y) d'un carreau ; sur une route, celui qui commence juste après elle. */
export const blockOf = (v: number) => Math.floor((v - CENTER) / GRID);
/** Rang du carreau dans son îlot, de 1 (contre la route d'avant) à GRID - 1 (contre la route d'après). */
export const cellOf = cell;
/** Route la plus proche en dessous / au-dessus. */
export const roadBelow = (v: number) => CENTER + Math.floor((v - CENTER) / GRID) * GRID;
export const roadAbove = (v: number) => CENTER + Math.ceil((v - CENTER) / GRID) * GRID;

/** Un carreau peut recevoir un bâtiment : dans la carte, hors route. */
export function isBuildable(x: number, y: number, size = MAP_SIZE): boolean {
  const { lo, hi } = mapBounds(size);
  return Number.isInteger(x) && Number.isInteger(y) && x >= lo + 1 && y >= lo + 1 && x < hi - 1 && y < hi - 1 && !isRoad(x, y);
}

type Zone = "center" | "industry" | "farm";
function zoneOf(cat: Category): Zone {
  if (cat === "industry" || cat === "energy") return "industry";
  if (cat === "agriculture") return "farm";
  return "center";
}

// Angle écran : +x part vers le bas-droite, +y vers le bas-gauche.
function sectorOf(x: number, y: number): Zone {
  const dx = x + 0.5 - CENTER, dy = y + 0.5 - CENTER;
  if (Math.hypot(dx, dy) < 6.5) return "center";
  const a = Math.atan2(dy, dx); // 0 = +x
  if (a > -Math.PI / 2.2 && a < Math.PI / 5) return "industry"; // est
  if (a >= Math.PI / 5 && a < Math.PI * 0.85) return "farm";   // sud
  return "center";
}

const TILES: { x: number; y: number; d: number; sector: Zone }[] = [];
const MAX = mapBounds(MAX_MAP_SIZE);
for (let x = MAX.lo + 1; x < MAX.hi - 1; x++) {
  for (let y = MAX.lo + 1; y < MAX.hi - 1; y++) {
    if (isRoad(x, y)) continue;
    TILES.push({ x, y, d: Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER), sector: sectorOf(x, y) });
  }
}

/** Nombre de carreaux constructibles d'une carte de côté `size`. */
export const buildableCount = (size = MAP_SIZE) => TILES.reduce((a, t) => a + (isBuildable(t.x, t.y, size) ? 1 : 0), 0);

/** Un terrain de `s` × `s` carreaux tient-il ici ? Tous ses carreaux doivent être constructibles (donc sans route)
 *  et libres ; `ignore` = le bâtiment qu'on déplace ou qu'on agrandit, dont les carreaux ne comptent pas. */
export function canPlace(used: Map<string, Plot>, x: number, y: number, s: number, size = MAP_SIZE, ignore?: Plot): boolean {
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) {
    if (!isBuildable(x + dx, y + dy, size)) return false;
    const o = used.get(`${x + dx},${y + dy}`);
    if (o && o !== ignore) return false;
  }
  return true;
}

export function placeTile(plots: Plot[], buildingId: string, size = MAP_SIZE, s = footprint(buildingId)): { x: number; y: number } | null {
  const zone = zoneOf(BUILDING_BY_ID[buildingId]?.category ?? "housing");
  const used = occupancy(plots);
  let best: (typeof TILES)[number] | null = null;
  let bestScore = Infinity;
  for (const t of TILES) {
    if (!canPlace(used, t.x, t.y, s, size)) continue;
    const score = t.d + (t.sector === zone ? 0 : zone === "center" ? 4 : 7) + (t.x * 31 + t.y * 17) % 7 * 0.01;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Îlot de la mairie : un îlot entier (4 × 4) contre le carrefour du centre. */
export const HALL_AT = { x: CENTER - GRID + 1, y: CENTER - GRID + 1 } as const;

/** Bâtiment neuf posé à cet angle, à la taille de son type. */
export const newPlot = (id: string, x: number, y: number): Plot => { const s = footprint(id); return s > 1 ? { id, x, y, s } : { id, x, y }; };

/** Reconstruit un plan à partir des bâtiments (anciennes sauvegardes). */
export function layoutFrom(buildings: Record<string, number>, size = MAP_SIZE): Plot[] {
  const plots: Plot[] = [];
  const order = ["townhall", "village", ...Object.keys(buildings).filter((k) => k !== "village" && k !== "townhall")];
  for (const id of order) {
    for (let i = 0; i < (buildings[id] ?? 0); i++) {
      // La mairie va sur son îlot du centre
      const hall = id === "townhall" && i === 0 && canPlace(occupancy(plots), HALL_AT.x, HALL_AT.y, footprint(id), size);
      const t = hall ? { ...HALL_AT } : placeTile(plots, id, size);
      if (t) plots.push(newPlot(id, t.x, t.y));
    }
  }
  return plots;
}

/** Plan de ville publié → emplacements sûrs à dessiner (bâtiments connus, carreaux valides, sans doublon). */
// ─── Plan publié pour les visites : format compact ───
// Une coordonnée = un caractère (la carte la plus grande fait 61 carreaux de côté, il y en a 64) : le plan d'une grande
// carte pleine tient en quelques Ko au lieu de ~30 Ko en liste de nombres, sous la limite de 16 Ko du serveur (publish_city).
// La clé GRID_KEY marque un plan de la grille actuelle ; sans elle, c'est l'ancienne grille (îlots de 3 × 3), convertie à la lecture.
const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOWEST = mapBounds(MAX_MAP_SIZE).lo;

/** Plan de la ville (`pack(...).pl`) → format compact. Une liste qui sort de la carte reste telle quelle (relue pareil). */
export const GRID_KEY = "_g";
export function compactCity(pl: Record<string, number[]>): Record<string, string | number[]> {
  const out: Record<string, string | number[]> = { [GRID_KEY]: String(GRID) };
  for (const [key, xy] of Object.entries(pl)) {
    const digits = xy.map((v) => DIGITS[v - LOWEST]);
    out[key] = xy.every((v) => Number.isInteger(v) && v - LOWEST >= 0 && v - LOWEST < DIGITS.length) ? digits.join("") : xy;
  }
  return out;
}

/** Coordonnées d'un plan publié : format compact (texte) ou ancien format (liste de nombres). */
function coords(xy: unknown): number[] | null {
  if (Array.isArray(xy)) return xy.map(Number);
  if (typeof xy !== "string") return null;
  return [...xy].map((c) => { const i = DIGITS.indexOf(c); return i < 0 ? NaN : i + LOWEST; });
}

export function plotsFromCity(city: unknown): Plot[] {
  if (!city || typeof city !== "object") return [];
  const used = new Map<string, Plot>(), out: Plot[] = [];
  const current = String((city as Record<string, unknown>)[GRID_KEY] ?? "") === String(GRID);
  for (const [key, raw] of Object.entries(city as Record<string, unknown>)) {
    // Les bâtiments de plus d'un carreau sont publiés sous « type*côté » (voir pack.ts)
    const [id, side] = key.split("*");
    const s0 = side === undefined ? 1 : Number(side);
    const xy = coords(raw);
    if (!BUILDING_BY_ID[id] || !xy || ![1, 2, 3, 4].includes(s0)) continue;
    for (let i = 0; i + 1 < xy.length && out.length < MAX_MAP_SIZE * MAX_MAP_SIZE; i += 2) {
      // Plan de l'ancienne grille : converti comme les sauvegardes (voir fromOldGrid)
      const q = current ? { id, x: Number(xy[i]), y: Number(xy[i + 1]), s: s0 } : fromOldGrid({ id, x: Number(xy[i]), y: Number(xy[i + 1]), s: s0 });
      const x = q.x, y = q.y, s = q.s ?? 1;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !canPlace(used, x, y, s, MAX_MAP_SIZE)) continue;
      const p: Plot = s > 1 ? { id, x, y, s } : { id, x, y };
      for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) used.set(`${x + dx},${y + dy}`, p);
      out.push(p);
    }
  }
  return out;
}

// ─── Ancienne grille (routes tous les 4 carreaux, îlots de 3 × 3) → grille actuelle ───
const OLD_GRID = 4;
/** Un bâtiment de l'ancienne grille, posé au même endroit de son îlot dans la nouvelle. Les 3 × 3 (un îlot entier)
 *  deviennent des 4 × 4 (un îlot entier). Les îlots ne bougent pas les uns par rapport aux autres : la ville garde sa forme. */
export function fromOldGrid(p: Plot): Plot {
  const conv = (v: number) => {
    const b = Math.floor((v - CENTER) / OLD_GRID), at = v - CENTER - b * OLD_GRID; // at : 1 à 3 dans l'îlot (0 = route)
    return CENTER + b * GRID + Math.max(1, at);
  };
  const s = sideOf(p) === 3 ? GRID - 1 : sideOf(p);
  return s > 1 ? { id: p.id, x: conv(p.x), y: conv(p.y), s } : { id: p.id, x: conv(p.x), y: conv(p.y) };
}
