// Cours simulés, déterministes : le même (symbole, instant) donne toujours
// le même prix, pour tous les joueurs et à chaque rechargement. Utilisé en
// mode démo (sans clé API) et pour l'historique quand le fournisseur n'en
// donne pas.
import { ASSET_BY_SYMBOL } from "./universe";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const EPOCH = Date.UTC(2026, 0, 1);

// (période, amplitude) — les amplitudes croissent avec la période, comme une marche aléatoire
const OCTAVES: [number, number][] = [
  [15 * MIN, 0.0015],
  [2 * HOUR, 0.004],
  [12 * HOUR, 0.009],
  [3 * DAY, 0.018],
  [12 * DAY, 0.035],
  [60 * DAY, 0.07],
  [240 * DAY, 0.12],
];

function hash(n: number, seed: number): number {
  let h = (Math.imul(n | 0, 0x27d4eb2d) ^ Math.imul(seed, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 0xffffffff) * 2 - 1; // [-1, 1]
}

function seedOf(symbol: string): number {
  let s = 2166136261;
  for (let i = 0; i < symbol.length; i++) s = Math.imul(s ^ symbol.charCodeAt(i), 16777619);
  return s >>> 0;
}

function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

export function simulatedPrice(symbol: string, t: number): number {
  const asset = ASSET_BY_SYMBOL[symbol];
  if (!asset) return 0;
  const seed = seedOf(symbol);
  let n = 0;
  OCTAVES.forEach(([period, amp], k) => { n += valueNoise((t - EPOCH) / period, seed + k * 7919) * amp; });
  const years = (t - EPOCH) / (365 * DAY);
  const p = asset.basePrice * Math.exp(asset.drift * years + n * asset.volatility * 1.6);
  return Math.round(p * 100) / 100;
}

export type Range = "1J" | "1S" | "1M" | "1A";
export const RANGES: Record<Range, { span: number; step: number }> = {
  "1J": { span: DAY, step: 15 * MIN },
  "1S": { span: 7 * DAY, step: 2 * HOUR },
  "1M": { span: 30 * DAY, step: 8 * HOUR },
  "1A": { span: 365 * DAY, step: 3 * DAY },
};

export function simulatedHistory(symbol: string, range: Range, now: number): { t: number; p: number }[] {
  const { span, step } = RANGES[range];
  const end = Math.floor(now / step) * step;
  const pts: { t: number; p: number }[] = [];
  for (let t = end - span; t <= end; t += step) pts.push({ t, p: simulatedPrice(symbol, t) });
  pts.push({ t: now, p: simulatedPrice(symbol, now) });
  return pts;
}

export const DAY_MS_MARKET = DAY;
