// Placement automatique des bâtiments sur la carte (pas de micro-gestion) :
// centre-ville résidentiel et commercial, industrie et énergie à l'est,
// agriculture au sud. Les routes quadrillent la carte tous les 4 carreaux.
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

/** Côté de la carte de départ. Le territoire peut s'agrandir autour du même centre (voir TERRITORY dans config). */
export const MAP_SIZE = 32;
export const MAX_MAP_SIZE = 48;
const CENTER = MAP_SIZE / 2;
/** Limites d'une carte de côté `size`, centrée comme la carte de départ : carreaux de `lo` à `hi - 1`. */
export function mapBounds(size = MAP_SIZE): { lo: number; hi: number } {
  const lo = (MAP_SIZE - size) / 2;
  return { lo, hi: lo + size };
}

export const isRoad = (x: number, y: number) => x % 4 === 0 || y % 4 === 0;

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
  if (Math.hypot(dx, dy) < 5) return "center";
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

/** Bâtiment neuf posé à cet angle, à la taille de son type. */
export const newPlot = (id: string, x: number, y: number): Plot => { const s = footprint(id); return s > 1 ? { id, x, y, s } : { id, x, y }; };

/** Reconstruit un plan à partir des bâtiments (anciennes sauvegardes). */
export function layoutFrom(buildings: Record<string, number>, size = MAP_SIZE): Plot[] {
  const plots: Plot[] = [];
  const order = ["village", "townhall", ...Object.keys(buildings).filter((k) => k !== "village" && k !== "townhall")];
  for (const id of order) {
    for (let i = 0; i < (buildings[id] ?? 0); i++) {
      const t = placeTile(plots, id, size);
      if (t) plots.push(newPlot(id, t.x, t.y));
    }
  }
  return plots;
}
