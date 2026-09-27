// Accès aux cours depuis le navigateur.
// - Site GitHub Pages : lit les fichiers public/data/*.json produits toutes les 15 min
//   par GitHub Actions (scripts/build-data.mts). Aucune clé API côté navigateur.
// - Page Claude (NEXT_PUBLIC_STATIC=1) : cours simulés calculés sur place.
// Toute action sans cours réel retombe sur le cours simulé.
import { ASSETS } from "./universe";
import { DAY_MS_MARKET, simulatedHistory, simulatedPrice, type Range } from "./simulate";

export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface ClientQuote { symbol: string; price: number; change: number; source: string }
type Point = { t: number; p: number };

function localQuote(symbol: string, now: number): ClientQuote {
  const price = simulatedPrice(symbol, now);
  const prev = simulatedPrice(symbol, now - DAY_MS_MARKET);
  return { symbol, price, change: prev ? price / prev - 1 : 0, source: "simulé" };
}

// Petit cache mémoire : un seul téléchargement par minute, même pour plusieurs ordres
const memo = new Map<string, { at: number; data: unknown }>();
async function getData<T>(path: string, ttl = 60_000): Promise<T | null> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  try {
    const r = await fetch(`${BASE_PATH}/data/${path}`, { cache: "no-cache" });
    if (!r.ok) return null;
    const data = (await r.json()) as T;
    memo.set(path, { at: Date.now(), data });
    return data;
  } catch { return null; }
}

export async function fetchQuotes(symbols?: string[]): Promise<{ mode: string; updatedAt: number; quotes: ClientQuote[] }> {
  const list = symbols ?? ASSETS.map((a) => a.symbol);
  const now = Date.now();
  if (STATIC_MODE) return { mode: "simulé", updatedAt: now, quotes: list.map((s) => localQuote(s, now)) };
  const file = await getData<{ updatedAt: number; quotes: ClientQuote[] }>("quotes.json");
  const real = new Map((file?.quotes ?? []).filter((q) => q.price > 0).map((q) => [q.symbol, q]));
  return {
    mode: real.size ? "réel" : "simulé",
    updatedAt: file?.updatedAt ?? now,
    quotes: list.map((s) => real.get(s) ?? localQuote(s, now)),
  };
}

/** Courbe simulée recalée sur le prix actuel (pour ne pas créer de saut). */
async function simulatedFor(symbol: string, range: Range) {
  const pts = simulatedHistory(symbol, range, Date.now());
  const q = (await fetchQuotes([symbol])).quotes[0];
  const k = q && pts.length ? q.price / pts[pts.length - 1].p : 1;
  return pts.map((p) => ({ t: p.t, p: Math.round(p.p * k * 100) / 100 }));
}

export async function fetchHistory(symbol: string, range: Range): Promise<{ points: Point[]; source: "réel" | "simulé" }> {
  if (STATIC_MODE) return { points: simulatedHistory(symbol, range, Date.now()), source: "simulé" };
  let points: Point[] = [];
  if (range === "1J") {
    const intraday = await getData<Record<string, Point[]>>("intraday.json");
    points = intraday?.[symbol] ?? [];
  } else {
    const index = await getData<{ symbols: string[] }>("history/index.json", 10 * 60_000);
    const h = index?.symbols?.includes(symbol) ? await getData<{ "1S": Point[]; "1A": Point[] }>(`history/${symbol}.json`, 10 * 60_000) : null;
    if (range === "1S") points = h?.["1S"] ?? [];
    else if (range === "1A") points = h?.["1A"] ?? [];
    else points = (h?.["1A"] ?? []).filter((p) => Date.now() - p.t < 31 * DAY_MS_MARKET);
  }
  if (points.length >= 3) return { points, source: "réel" };
  return { points: await simulatedFor(symbol, range), source: "simulé" };
}
