// Accès aux cours depuis le navigateur.
// - Site publié : lit les cours et les courbes dans Supabase (lecture seule, clé publique).
//   Une fonction Supabase les met à jour toutes les heures (supabase/functions/refresh-market).
// - Page Claude (NEXT_PUBLIC_STATIC=1) : cours simulés calculés sur place.
// Toute action sans cours réel retombe sur le cours simulé.
import { ASSETS } from "./universe";
import { DAY_MS_MARKET, simulatedHistory, simulatedPrice, type Range } from "./simulate";

export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Valeurs publiques (faites pour le navigateur) : la base n'autorise que la lecture des cours.
export const SUPABASE_URL = "https://elpkixotuarcymalehjs.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVscGtpeG90dWFyY3ltYWxlaGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MjEzMDAsImV4cCI6MjEwNjA5NzMwMH0.tP0WZYp1bPW2-hEEOdzQVmTiysyh3cKs_hBq0MJWu8M";

export interface ClientQuote { symbol: string; price: number; change: number; source: string }
type Point = { t: number; p: number };

function localQuote(symbol: string, now: number): ClientQuote {
  const price = simulatedPrice(symbol, now);
  const prev = simulatedPrice(symbol, now - DAY_MS_MARKET);
  return { symbol, price, change: prev ? price / prev - 1 : 0, source: "simulé" };
}

// Petit cache mémoire : une seule requête par minute, même pour plusieurs ordres
const memo = new Map<string, { at: number; data: unknown }>();
async function rest<T>(query: string, ttl = 60_000): Promise<T | null> {
  const hit = memo.get(query);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as T;
    memo.set(query, { at: Date.now(), data });
    return data;
  } catch { return null; }
}

export async function fetchQuotes(symbols?: string[]): Promise<{ mode: string; updatedAt: number; quotes: ClientQuote[] }> {
  const list = symbols ?? ASSETS.map((a) => a.symbol);
  const now = Date.now();
  if (STATIC_MODE) return { mode: "simulé", updatedAt: now, quotes: list.map((s) => localQuote(s, now)) };
  const rows = await rest<{ symbol: string; price: string | number; change_1d: string | number | null; updated_at: string }[]>(
    "asset_prices?select=symbol,price,change_1d,updated_at");
  const real = new Map((rows ?? [])
    .filter((r) => Number(r.price) > 0)
    .map((r) => [r.symbol, { symbol: r.symbol, price: Math.round(Number(r.price) * 100) / 100, change: Number(r.change_1d ?? 0), source: "réel" }]));
  const updatedAt = Math.max(0, ...(rows ?? []).map((r) => Date.parse(r.updated_at) || 0));
  return {
    mode: real.size ? "réel" : "simulé",
    updatedAt: updatedAt || now,
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

async function series(symbol: string, interval: "1h" | "1d", filter: string, ttl: number): Promise<Point[]> {
  const rows = await rest<{ t: string; price: string | number }[]>(
    `market_series?select=t,price&symbol=eq.${encodeURIComponent(symbol)}&interval=eq.${interval}${filter}`, ttl);
  return (rows ?? []).map((r) => ({ t: Date.parse(r.t), p: Math.round(Number(r.price) * 100) / 100 })).filter((p) => p.p > 0).sort((a, b) => a.t - b.t);
}

export async function fetchHistory(symbol: string, range: Range): Promise<{ points: Point[]; source: "réel" | "simulé" }> {
  if (STATIC_MODE) return { points: simulatedHistory(symbol, range, Date.now()), source: "simulé" };
  const since = (days: number) => `&t=gte.${new Date(Date.now() - days * DAY_MS_MARKET).toISOString()}`;
  let points: Point[] = [];
  if (range === "1J") {
    // Dernière journée de cotation connue (le week-end, on montre le vendredi)
    const recent = await series(symbol, "1h", "&order=t.desc&limit=48", 5 * 60_000);
    const last = recent[recent.length - 1]?.t ?? 0;
    points = recent.filter((p) => last - p.t <= DAY_MS_MARKET);
  } else if (range === "1S") points = await series(symbol, "1h", `${since(7)}&order=t.asc`, 10 * 60_000);
  else if (range === "1M") points = await series(symbol, "1d", `${since(31)}&order=t.asc`, 60 * 60_000);
  else points = await series(symbol, "1d", `${since(366)}&order=t.asc`, 60 * 60_000);
  if (points.length >= 3) return { points, source: "réel" };
  return { points: await simulatedFor(symbol, range), source: "simulé" };
}
