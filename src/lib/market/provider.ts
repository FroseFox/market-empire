// Couche « fournisseur de données » — côté serveur uniquement.
// Le client n'appelle jamais l'API externe : il passe par /api/quotes,
// qui met les prix en cache (coût, limites d'appels, licence).
//
// - Sans FINNHUB_API_KEY : prix simulés (mode démo).
// - Avec FINNHUB_API_KEY : prix réels Finnhub, repli sur le simulé symbole par symbole.
//   ⚠️ L'offre gratuite Finnhub est réservée à un usage personnel : avant d'ouvrir
//   le jeu au public, passer sur une offre qui autorise l'affichage à des tiers.
import "server-only";
import { ASSET_BY_SYMBOL, ASSETS } from "./universe";
import { DAY_MS_MARKET, simulatedPrice } from "./simulate";

export type QuoteSource = "simulé" | "finnhub";
export interface Quote { symbol: string; price: number; change: number; source: QuoteSource; at: number }

/** Conversion USD → EUR. À remplacer par un taux de change réel (Finnhub forex, BCE…). */
const USD_TO_EUR = Number(process.env.USD_TO_EUR ?? 0.86);
const CACHE_MS = 60_000;

const cache = new Map<string, Quote>();

function simulatedQuote(symbol: string, now: number): Quote {
  const price = simulatedPrice(symbol, now);
  const prev = simulatedPrice(symbol, now - DAY_MS_MARKET);
  return { symbol, price, change: prev ? price / prev - 1 : 0, source: "simulé", at: now };
}

async function finnhubQuote(symbol: string, key: string, now: number): Promise<Quote | null> {
  const asset = ASSET_BY_SYMBOL[symbol];
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.providerSymbol)}&token=${key}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { c?: number; dp?: number };
    if (!j.c) return null; // symbole non couvert par l'offre
    const fx = asset.currency === "USD" ? USD_TO_EUR : 1;
    return { symbol, price: Math.round(j.c * fx * 100) / 100, change: (j.dp ?? 0) / 100, source: "finnhub", at: now };
  } catch {
    return null;
  }
}

export async function getQuotes(symbols: string[] = ASSETS.map((x) => x.symbol)): Promise<Quote[]> {
  const now = Date.now();
  const key = process.env.FINNHUB_API_KEY;
  const valid = symbols.filter((s) => ASSET_BY_SYMBOL[s]);
  if (!key) return valid.map((s) => simulatedQuote(s, now));

  return Promise.all(valid.map(async (s) => {
    const hit = cache.get(s);
    if (hit && now - hit.at < CACHE_MS) return hit;
    const q = (await finnhubQuote(s, key, now)) ?? simulatedQuote(s, now);
    cache.set(s, q);
    return q;
  }));
}

export function dataMode(): QuoteSource {
  return process.env.FINNHUB_API_KEY ? "finnhub" : "simulé";
}
