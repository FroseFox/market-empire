// Récupère les données de marché et les écrit dans public/data/ avant la construction du site.
// Lancé par GitHub Actions (toutes les 15 min en semaine) : les clés API restent des
// secrets GitHub et n'apparaissent jamais dans le site publié.
//
//   FINNHUB_API_KEY      → cours (sinon : aucun fichier de cours, le site simule)
//   TWELVE_DATA_API_KEY  → historique 1 semaine / 1 an, rafraîchi une fois par jour
//   SITE_URL             → adresse du site publié, pour reprendre la courbe du jour déjà collectée
//
// Usage : npx tsx scripts/build-data.mts
import { mkdir, writeFile } from "node:fs/promises";
import { ASSETS } from "../src/lib/market/universe";

const OUT = new URL("../public/data/", import.meta.url);
const FINNHUB = process.env.FINNHUB_API_KEY ?? "";
const TWELVE = process.env.TWELVE_DATA_API_KEY ?? "";
const SITE = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const now = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round2 = (v: number) => Math.round(v * 100) / 100;

async function getJson<T>(url: string, timeout = 8000): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { "cache-control": "no-cache" } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
async function save(path: string, data: unknown) {
  const url = new URL(path, OUT);
  await mkdir(new URL(".", url), { recursive: true });
  await writeFile(url, JSON.stringify(data));
}

// ─── Taux de change USD → EUR (BCE) ───
const fxJson = await getJson<{ rates?: { EUR?: number } }>("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
const fx = fxJson?.rates?.EUR && fxJson.rates.EUR > 0.3 && fxJson.rates.EUR < 3 ? fxJson.rates.EUR : 0.86;
console.log(`Taux USD→EUR : ${fx}`);

// ─── Cours (Finnhub) ───
type Quote = { symbol: string; price: number; change: number; source: "réel" };
const quotes: Quote[] = [];
if (FINNHUB) {
  for (const a of ASSETS) {
    const j = await getJson<{ c?: number; dp?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.providerSymbol)}&token=${FINNHUB}`);
    if (j?.c && j.c > 0) {
      const price = round2(j.c * (a.currency === "USD" ? fx : 1));
      if (price > 0) quotes.push({ symbol: a.symbol, price, change: (j.dp ?? 0) / 100, source: "réel" });
    }
    await sleep(1100); // offre gratuite : 60 requêtes / minute
  }
  console.log(`Cours réels : ${quotes.length} / ${ASSETS.length}`);
} else {
  console.log("Pas de FINNHUB_API_KEY : le site utilisera des cours simulés.");
}
await save("quotes.json", { updatedAt: now, fx, quotes });

// ─── Courbe du jour : on ajoute le point actuel à celle déjà publiée ───
type Point = { t: number; p: number };
const prevIntraday = SITE ? await getJson<Record<string, Point[]>>(`${SITE}/data/intraday.json`) : null;
const intraday: Record<string, Point[]> = {};
for (const q of quotes) {
  const past = (prevIntraday?.[q.symbol] ?? []).filter((pt) => now - pt.t < 26 * 3_600_000);
  const last = past[past.length - 1];
  if (!last || now - last.t > 5 * 60_000) past.push({ t: now, p: q.price });
  intraday[q.symbol] = past.slice(-200);
}
await save("intraday.json", intraday);

// ─── Historique (Twelve Data), une fois par jour ───
type HistoryFile = { updatedAt: number; "1S": Point[]; "1A": Point[] };
const prevIndex = SITE ? await getJson<{ updatedAt: number; symbols: string[] }>(`${SITE}/data/history/index.json`) : null;
const fresh = prevIndex && now - prevIndex.updatedAt < 20 * 3_600_000;
const done: string[] = [];

if (fresh) {
  // Historique encore frais : on reprend les fichiers déjà publiés
  for (const s of prevIndex.symbols) {
    const h = await getJson<HistoryFile>(`${SITE}/data/history/${s}.json`);
    if (h) { await save(`history/${s}.json`, h); done.push(s); }
  }
  await save("history/index.json", { updatedAt: prevIndex.updatedAt, symbols: done });
  console.log(`Historique repris : ${done.length} actions`);
} else if (TWELVE) {
  const series = async (symbol: string, interval: string, size: number, currency: string): Promise<Point[]> => {
    const j = await getJson<{ status?: string; meta?: { currency?: string }; values?: { datetime: string; close: string }[] }>(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${size}&timezone=UTC&apikey=${TWELVE}`, 15000);
    await sleep(8000); // offre gratuite : 8 requêtes / minute
    if (j?.status !== "ok" || !j.values?.length) return [];
    const rate = (j.meta?.currency ?? currency) === "USD" ? fx : 1;
    return j.values
      .map((v) => ({ t: Date.parse(`${v.datetime.replace(" ", "T")}Z`), p: round2(Number(v.close) * rate) }))
      .filter((v) => Number.isFinite(v.t) && v.p > 0)
      .sort((a, b) => a.t - b.t);
  };
  for (const a of ASSETS) {
    const week = await series(a.symbol, "1h", 50, a.currency);
    const year = await series(a.symbol, "1day", 252, a.currency);
    if (week.length > 1 || year.length > 1) {
      await save(`history/${a.symbol}.json`, { updatedAt: now, "1S": week, "1A": year } satisfies HistoryFile);
      done.push(a.symbol);
    }
  }
  await save("history/index.json", { updatedAt: now, symbols: done });
  console.log(`Historique téléchargé : ${done.length} actions`);
} else {
  await save("history/index.json", { updatedAt: 0, symbols: [] });
  console.log("Pas de TWELVE_DATA_API_KEY : courbes simulées.");
}
