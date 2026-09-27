// Couche « fournisseur de données » — côté serveur uniquement.
// Le client n'appelle jamais les API externes : il passe par /api/quotes et
// /api/history, dont les réponses sont mises en cache par Vercel (CDN).
//
// - Sans FINNHUB_API_KEY : prix simulés (mode démo).
// - Avec FINNHUB_API_KEY : prix réels Finnhub, repli sur le simulé symbole par symbole.
// - Avec TWELVE_DATA_API_KEY : vraies courbes historiques (sinon courbes simulées).
//   ⚠️ Les offres gratuites sont réservées à un usage personnel.
import "server-only";
import { ASSET_BY_SYMBOL, ASSETS } from "./universe";
import { DAY_MS_MARKET, simulatedHistory, simulatedPrice, type Range } from "./simulate";

export type QuoteSource = "simulé" | "finnhub";
export interface Quote { symbol: string; price: number; change: number; source: QuoteSource; at: number }

const QUOTE_CACHE_MS = 60_000;
const quoteCache = new Map<string, Quote>();

// ─── Taux de change USD → EUR (BCE via Frankfurter, sans clé) ───

const FX_FALLBACK = 0.86;
let fx = { rate: 0, at: 0 };

function envRate(): number | null {
  const v = Number(process.env.USD_TO_EUR);
  return Number.isFinite(v) && v > 0.3 && v < 3 ? v : null; // variable vide ou fausse : ignorée
}

export async function usdToEur(): Promise<number> {
  const now = Date.now();
  if (fx.rate > 0 && now - fx.at < 6 * 3_600_000) return fx.rate;
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const j = (await res.json()) as { rates?: { EUR?: number } };
    const r = j.rates?.EUR;
    if (r && r > 0.3 && r < 3) { fx = { rate: r, at: now }; return r; }
  } catch { /* on garde la valeur de secours */ }
  return envRate() ?? (fx.rate || FX_FALLBACK);
}

// ─── Cours ───

function simulatedQuote(symbol: string, now: number): Quote {
  const price = simulatedPrice(symbol, now);
  const prev = simulatedPrice(symbol, now - DAY_MS_MARKET);
  return { symbol, price, change: prev ? price / prev - 1 : 0, source: "simulé", at: now };
}

async function finnhubQuote(symbol: string, key: string, now: number, rate: number): Promise<Quote | null> {
  const asset = ASSET_BY_SYMBOL[symbol];
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.providerSymbol)}&token=${key}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { c?: number; dp?: number };
    if (!j.c || !(j.c > 0)) return null; // symbole non couvert par l'offre
    const price = Math.round(j.c * (asset.currency === "USD" ? rate : 1) * 100) / 100;
    if (!(price > 0)) return null;
    return { symbol, price, change: (j.dp ?? 0) / 100, source: "finnhub", at: now };
  } catch {
    return null;
  }
}

export async function getQuotes(symbols: string[] = ASSETS.map((x) => x.symbol)): Promise<Quote[]> {
  const now = Date.now();
  const key = process.env.FINNHUB_API_KEY;
  const valid = [...new Set(symbols)].filter((s) => ASSET_BY_SYMBOL[s]).slice(0, 60);
  if (!key) return valid.map((s) => simulatedQuote(s, now));
  const rate = await usdToEur();
  return Promise.all(valid.map(async (s) => {
    const hit = quoteCache.get(s);
    if (hit && now - hit.at < QUOTE_CACHE_MS) return hit;
    const q = (await finnhubQuote(s, key, now, rate)) ?? simulatedQuote(s, now);
    quoteCache.set(s, q);
    return q;
  }));
}

export function dataMode(): QuoteSource {
  return process.env.FINNHUB_API_KEY ? "finnhub" : "simulé";
}

// ─── Historique ───

const TD_PARAMS: Record<Range, { interval: string; outputsize: number }> = {
  "1J": { interval: "15min", outputsize: 32 },
  "1S": { interval: "1h", outputsize: 50 },
  "1M": { interval: "1day", outputsize: 23 },
  "1A": { interval: "1day", outputsize: 252 },
};

export type HistorySource = "réel" | "simulé";

export async function getHistory(symbol: string, range: Range): Promise<{ points: { t: number; p: number }[]; source: HistorySource }> {
  const asset = ASSET_BY_SYMBOL[symbol];
  const key = process.env.TWELVE_DATA_API_KEY;
  if (key && asset) {
    try {
      const { interval, outputsize } = TD_PARAMS[range];
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(asset.symbol)}&interval=${interval}&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const j = (await res.json()) as { status?: string; meta?: { currency?: string }; values?: { datetime: string; close: string }[] };
      if (j.status === "ok" && j.values?.length) {
        const rate = (j.meta?.currency ?? asset.currency) === "USD" ? await usdToEur() : 1;
        const points = j.values
          .map((v) => ({ t: Date.parse(v.datetime.replace(" ", "T") + "Z"), p: Math.round(Number(v.close) * rate * 100) / 100 }))
          .filter((v) => Number.isFinite(v.t) && v.p > 0)
          .sort((a, b) => a.t - b.t);
        if (points.length > 1) return { points, source: "réel" };
      }
    } catch { /* repli sur la courbe simulée */ }
  }
  return { points: simulatedHistory(symbol, range, Date.now()), source: "simulé" };
}
