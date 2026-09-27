// Market Empire — mise à jour des cours (Supabase Edge Function « refresh-market »).
// Appelée toutes les 10 minutes par pg_cron. Chaque appel ne met à jour que les
// actifs dont le cours a plus de 50 minutes (par lots), donc chaque action est
// rafraîchie environ une fois par heure sans dépasser les quotas gratuits.
// Les cryptomonnaies (une seule requête pour toutes) sont rafraîchies à chaque appel.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   FINNHUB_API_KEY      cours des actions et ETF cotés aux États-Unis
//   TWELVE_DATA_API_KEY  historique quotidien (1 mois / 1 an)
// CoinGecko (cryptos) ne demande pas de clé.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FINNHUB = Deno.env.get("FINNHUB_API_KEY") ?? "";
const TWELVE = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";

const QUOTE_MAX_AGE = 50 * 60_000;
const QUOTE_BATCH = 40;          // Finnhub gratuit : 60 requêtes / minute
const FINNHUB_GAP_MS = 1_100;
const CRYPTO_MAX_AGE = 4 * 60_000;
const HISTORY_MAX_AGE = 20 * 3_600_000;
const HISTORY_BATCH = 2;         // Twelve Data gratuit : 8 requêtes / minute, 800 / jour
const TD_GAP_MS = 7_600;
const CRYPTO_HISTORY_BATCH = 2;  // CoinGecko public : quelques requêtes / minute
const CG_GAP_MS = 3_000;

type AssetRow = {
  symbol: string; provider_symbol: string; us_symbol: string | null; us_factor: number | null;
  coingecko_id: string | null; history_updated_at: string | null;
};

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function getJson<T>(url: string, ms = 10_000): Promise<T | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } }); return r.ok ? (await r.json()) as T : null; } catch { return null; }
}

/** Devise de cotation déduite du symbole fournisseur (Paris, Francfort → euro). */
const quoteCurrency = (providerSymbol: string) => (/\.(PA|DE|AS)$/.test(providerSymbol) ? "EUR" : "USD");

Deno.serve(async () => {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const hour = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString();
  const report: Record<string, unknown> = {};

  const assets = (await (await db("assets?select=symbol,provider_symbol,us_symbol,us_factor,coingecko_id,history_updated_at&active=eq.true")).json()) as AssetRow[];
  const prev = (await (await db("asset_prices?select=symbol,price,updated_at")).json()) as { symbol: string; price: number; updated_at: string }[];
  const prevBy = new Map(prev.map((p) => [p.symbol, { price: Number(p.price), at: Date.parse(p.updated_at) }]));

  const prices: Record<string, unknown>[] = [], points: Record<string, unknown>[] = [];
  const add = (symbol: string, price: number, change: number, source: string) => {
    if (!(price > 0)) return;
    prices.push({ symbol, price, change_1d: Math.max(-9.99, Math.min(9.99, change)), source, updated_at: iso });
    // Un point par heure (le dernier de l'heure l'emporte), seulement si le cours a bougé
    if (prevBy.get(symbol)?.price !== price) points.push({ symbol, interval: "1h", t: hour, price });
  };

  // ─── Taux de change (BCE) ───
  const fxJson = await getJson<{ rates?: { EUR?: number } }>("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
  const fx = fxJson?.rates?.EUR && fxJson.rates.EUR > 0.3 && fxJson.rates.EUR < 3 ? fxJson.rates.EUR : 0.86;
  report.fx = fx;

  // ─── Cryptomonnaies (CoinGecko, en euros, une seule requête) ───
  const coins = assets.filter((a) => a.coingecko_id);
  const cryptoStale = coins.some((a) => now - (prevBy.get(a.symbol)?.at ?? 0) > CRYPTO_MAX_AGE);
  if (coins.length && cryptoStale) {
    const ids = coins.map((a) => a.coingecko_id).join(",");
    const cg = await getJson<Record<string, { eur?: number; eur_24h_change?: number }>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=eur&include_24hr_change=true`);
    let n = 0;
    for (const a of coins) {
      const c = cg?.[a.coingecko_id!];
      if (c?.eur && c.eur > 0) { add(a.symbol, round4(c.eur), (c.eur_24h_change ?? 0) / 100, "coingecko"); n++; }
    }
    report.crypto = `${n}/${coins.length}`;
  } else report.crypto = "déjà à jour";

  // ─── Actions, ETF, matières premières (Finnhub), par lots ───
  if (!FINNHUB) report.quotes = "FINNHUB_API_KEY manquante";
  else {
    const due = assets
      .filter((a) => !a.coingecko_id && now - (prevBy.get(a.symbol)?.at ?? 0) > QUOTE_MAX_AGE)
      .sort((x, y) => (prevBy.get(x.symbol)?.at ?? 0) - (prevBy.get(y.symbol)?.at ?? 0))
      .slice(0, QUOTE_BATCH);
    const failed: string[] = [];
    for (const a of due) {
      // Sociétés étrangères : cotation américaine × nombre d'unités par action
      const sym = a.us_symbol ?? a.provider_symbol;
      const q = await getJson<{ c?: number; dp?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB}`);
      if (q?.c && q.c > 0) {
        const rate = a.us_symbol ? Number(a.us_factor ?? 1) * fx : quoteCurrency(a.provider_symbol) === "USD" ? fx : 1;
        add(a.symbol, round4(q.c * rate), (q.dp ?? 0) / 100, a.us_symbol ? "finnhub-us" : "finnhub");
      } else failed.push(a.symbol);
      await sleep(FINNHUB_GAP_MS);
    }
    report.quotes = `${due.length - failed.length}/${due.length}`;
    if (failed.length) report.failed = failed;
    report.waiting = assets.filter((a) => !a.coingecko_id && now - (prevBy.get(a.symbol)?.at ?? 0) > QUOTE_MAX_AGE).length - due.length;
  }

  if (prices.length) await db("asset_prices", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(prices) });
  if (points.length) await db("market_series", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(points) });
  report.hourlyPoints = points.length;

  // ─── Historique quotidien, par petits lots ───
  const stale = assets.filter((a) => !a.history_updated_at || now - Date.parse(a.history_updated_at) > HISTORY_MAX_AGE);
  const markDone = (symbol: string) =>
    // Marqué même en cas d'échec : on réessaiera demain plutôt qu'à chaque appel
    db(`assets?symbol=eq.${encodeURIComponent(symbol)}`, { method: "PATCH", body: JSON.stringify({ history_updated_at: iso }) });
  const saveDaily = (symbol: string, rows: { t: string; price: number }[]) =>
    db("market_series", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows.filter((r) => r.price > 0).map((r) => ({ symbol, interval: "1d", ...r }))),
    });

  // Actions, ETF… : Twelve Data
  if (!TWELVE) report.history = "TWELVE_DATA_API_KEY manquante";
  else {
    const batch = stale.filter((a) => !a.coingecko_id).slice(0, HISTORY_BATCH);
    let ok = 0;
    for (const a of batch) {
      const sym = a.us_symbol ?? a.provider_symbol;
      const j = await getJson<{ status?: string; meta?: { currency?: string }; values?: { datetime: string; close: string }[] }>(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1day&outputsize=260&timezone=UTC&apikey=${TWELVE}`, 15_000);
      if (j?.status === "ok" && j.values?.length) {
        const cur = j.meta?.currency ?? (a.us_symbol ? "USD" : quoteCurrency(a.provider_symbol));
        const rate = (cur === "USD" ? fx : 1) * (a.us_symbol ? Number(a.us_factor ?? 1) : 1);
        await saveDaily(a.symbol, j.values.map((v) => ({ t: `${v.datetime.slice(0, 10)}T00:00:00Z`, price: round4(Number(v.close) * rate) })));
        ok++;
      }
      await markDone(a.symbol);
      await sleep(TD_GAP_MS);
    }
    report.history = `${ok}/${batch.length}`;
  }

  // Cryptos : CoinGecko (clôtures quotidiennes sur 1 an, en euros)
  const cBatch = stale.filter((a) => a.coingecko_id).slice(0, CRYPTO_HISTORY_BATCH);
  let cOk = 0;
  for (const a of cBatch) {
    const j = await getJson<{ prices?: [number, number][] }>(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(a.coingecko_id!)}/market_chart?vs_currency=eur&days=365&interval=daily`, 15_000);
    if (j?.prices?.length) {
      const byDay = new Map<string, number>();
      for (const [t, p] of j.prices) byDay.set(`${new Date(t).toISOString().slice(0, 10)}T00:00:00Z`, round4(p));
      await saveDaily(a.symbol, [...byDay].map(([t, price]) => ({ t, price })));
      cOk++;
    }
    await markDone(a.symbol);
    await sleep(CG_GAP_MS);
  }
  if (cBatch.length) report.cryptoHistory = `${cOk}/${cBatch.length}`;
  report.historyWaiting = Math.max(0, stale.length - HISTORY_BATCH - cBatch.length);

  // ─── Ménage (une fois par heure suffit) ───
  if (new Date(now).getUTCMinutes() < 10) {
    await db(`market_series?interval=eq.1h&t=lt.${new Date(now - 10 * 86_400_000).toISOString()}`, { method: "DELETE" });
    await db(`market_series?interval=eq.1d&t=lt.${new Date(now - 400 * 86_400_000).toISOString()}`, { method: "DELETE" });
  }

  return json({ ok: true, ...report });
});
