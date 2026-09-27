// Accès aux cours depuis le navigateur.
// - Version serveur (Next.js) : passe par /api/quotes et /api/history.
// - Version autonome (NEXT_PUBLIC_STATIC=1, page web sans serveur) : cours simulés calculés sur place.
import { ASSETS } from "./universe";
import { DAY_MS_MARKET, simulatedHistory, simulatedPrice, type Range } from "./simulate";

export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC === "1";

export interface ClientQuote { symbol: string; price: number; change: number; source: string }

function localQuotes(symbols: string[]): ClientQuote[] {
  const now = Date.now();
  return symbols.map((symbol) => {
    const price = simulatedPrice(symbol, now);
    const prev = simulatedPrice(symbol, now - DAY_MS_MARKET);
    return { symbol, price, change: prev ? price / prev - 1 : 0, source: "simulé" };
  });
}

export async function fetchQuotes(symbols?: string[]): Promise<{ mode: string; quotes: ClientQuote[] }> {
  const list = symbols ?? ASSETS.map((a) => a.symbol);
  if (STATIC_MODE) return { mode: "simulé", quotes: localQuotes(list) };
  const r = await fetch(`/api/quotes${symbols ? `?symbols=${symbols.join(",")}` : ""}`, { cache: "no-store" });
  return r.json();
}

export async function fetchHistory(symbol: string, range: Range): Promise<{ points: { t: number; p: number }[]; indicative: boolean }> {
  if (STATIC_MODE) return { points: simulatedHistory(symbol, range, Date.now()), indicative: false };
  const r = await fetch(`/api/history?symbol=${symbol}&range=${range}`);
  return r.json();
}
