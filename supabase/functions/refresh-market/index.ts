// Market Empire — mise à jour des cours (Supabase Edge Function « refresh-market »).
// Appelée chaque heure par pg_cron. Peut aussi être appelée à la main : elle ne
// travaille que si les cours ont plus de 50 minutes, donc impossible d'épuiser les quotas.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   FINNHUB_API_KEY      cours des actions américaines
//   TWELVE_DATA_API_KEY  cours européens + historique quotidien (1 mois / 1 an)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FINNHUB = Deno.env.get("FINNHUB_API_KEY") ?? "";
const TWELVE = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const MIN_GAP_MS = 50 * 60_000;
const HISTORY_BATCH = 4; // offre gratuite Twelve Data : 8 requêtes / minute (partagées avec les cours européens)
const TD_GAP_MS = 7_600;

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function getJson<T>(url: string, ms = 10_000): Promise<T | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.ok ? (await r.json()) as T : null; } catch { return null; }
}

/** Devise de cotation déduite du symbole fournisseur (Paris, Francfort → euro). */
const quoteCurrency = (providerSymbol: string) => (/\.(PA|DE|AS)$/.test(providerSymbol) ? "EUR" : "USD");
/** Symbole Twelve Data : place de cotation européenne via le code MIC. */
function twelveSymbol(providerSymbol: string) {
  const m = providerSymbol.match(/^(.+)\.(PA|DE|AS)$/);
  if (!m) return `symbol=${encodeURIComponent(providerSymbol)}`;
  const mic = { PA: "XPAR", DE: "XETR", AS: "XAMS" }[m[2] as "PA" | "DE" | "AS"];
  return `symbol=${encodeURIComponent(m[1])}&mic_code=${mic}`;
}

Deno.serve(async () => {
  const now = Date.now();
  const report: Record<string, unknown> = {};

  const assets = (await (await db("assets?select=symbol,provider_symbol,us_symbol,us_factor,history_updated_at&active=eq.true")).json()) as
    { symbol: string; provider_symbol: string; us_symbol: string | null; us_factor: number | null; history_updated_at: string | null }[];

  // ─── Garde-fou : pas plus d'une mise à jour toutes les 50 minutes ───
  const last = (await (await db("asset_prices?select=updated_at&order=updated_at.desc&limit=1")).json()) as { updated_at: string }[];
  const fresh = last[0] && now - Date.parse(last[0].updated_at) < MIN_GAP_MS;

  // ─── Taux de change (BCE) ───
  const fxJson = await getJson<{ rates?: { EUR?: number } }>("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
  const fx = fxJson?.rates?.EUR && fxJson.rates.EUR > 0.3 && fxJson.rates.EUR < 3 ? fxJson.rates.EUR : 0.86;
  report.fx = fx;

  // ─── Cours (Finnhub) + point horaire ───
  if (!FINNHUB) report.quotes = "FINNHUB_API_KEY manquante";
  else if (fresh) report.quotes = "déjà à jour";
  else {
    const prev = (await (await db("asset_prices?select=symbol,price")).json()) as { symbol: string; price: number }[];
    const prevPrice = new Map(prev.map((p) => [p.symbol, Number(p.price)]));
    const prices: Record<string, unknown>[] = [], points: Record<string, unknown>[] = [];
    const hour = new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString();
    const add = (symbol: string, price: number, change: number, source: string) => {
      prices.push({ symbol, price, change_1d: change, source, updated_at: new Date(now).toISOString() });
      // Un point par heure, seulement si le cours a bougé (marché ouvert)
      if (prevPrice.get(symbol) !== price) points.push({ symbol, interval: "1h", t: hour, price });
    };
    const missing: typeof assets = [];
    for (const a of assets) {
      const q = await getJson<{ c?: number; dp?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.provider_symbol)}&token=${FINNHUB}`);
      if (q?.c && q.c > 0) add(a.symbol, round4(q.c * (quoteCurrency(a.provider_symbol) === "USD" ? fx : 1)), (q.dp ?? 0) / 100, "finnhub");
      else missing.push(a);
      await sleep(1100); // offre gratuite : 60 requêtes / minute
    }
    // Actions européennes : leur cotation américaine (action ou ADR) × facteur, en euros
    const stillMissing: typeof assets = [];
    for (const a of missing) {
      const q = a.us_symbol ? await getJson<{ c?: number; dp?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.us_symbol)}&token=${FINNHUB}`) : null;
      if (q?.c && q.c > 0) add(a.symbol, round4(q.c * Number(a.us_factor ?? 1) * fx), (q.dp ?? 0) / 100, "finnhub-us");
      else stillMissing.push(a);
      if (a.us_symbol) await sleep(1100);
    }
    report.europe = `${missing.length - stillMissing.length}/${missing.length}`;
    // Dernier recours : Twelve Data (selon l'offre, les bourses européennes peuvent être exclues)
    if (TWELVE) {
      for (const a of stillMissing) {
        const q = await getJson<{ close?: string; percent_change?: string; currency?: string; code?: number }>(
          `https://api.twelvedata.com/quote?${twelveSymbol(a.provider_symbol)}&apikey=${TWELVE}`);
        const close = Number(q?.close);
        if (close > 0) add(a.symbol, round4(close * ((q?.currency ?? quoteCurrency(a.provider_symbol)) === "USD" ? fx : 1)), Number(q?.percent_change ?? 0) / 100, "twelvedata");
        await sleep(TD_GAP_MS);
      }
    }
    if (prices.length) await db("asset_prices", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(prices) });
    if (points.length) await db("market_series", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(points) });
    report.quotes = prices.length;
    report.hourlyPoints = points.length;
  }

  // ─── Historique quotidien (Twelve Data), par petits lots ───
  if (!TWELVE) report.history = "TWELVE_DATA_API_KEY manquante";
  else {
    const stale = assets
      .filter((a) => !a.history_updated_at || now - Date.parse(a.history_updated_at) > 20 * 3_600_000)
      .slice(0, HISTORY_BATCH);
    let ok = 0;
    for (const a of stale) {
      const sym = a.us_symbol ? `symbol=${encodeURIComponent(a.us_symbol)}` : twelveSymbol(a.provider_symbol);
      const j = await getJson<{ status?: string; meta?: { currency?: string }; values?: { datetime: string; close: string }[] }>(
        `https://api.twelvedata.com/time_series?${sym}&interval=1day&outputsize=260&timezone=UTC&apikey=${TWELVE}`, 15_000);
      if (j?.status === "ok" && j.values?.length) {
        const cur = j.meta?.currency ?? (a.us_symbol ? "USD" : quoteCurrency(a.provider_symbol));
        const rate = (cur === "USD" ? fx : 1) * (a.us_symbol ? Number(a.us_factor ?? 1) : 1);
        const rows = j.values
          .map((v) => ({ symbol: a.symbol, interval: "1d", t: `${v.datetime.slice(0, 10)}T00:00:00Z`, price: round4(Number(v.close) * rate) }))
          .filter((r) => r.price > 0);
        await db("market_series", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) });
        ok++;
      }
      await sleep(TD_GAP_MS);
      // Marqué même en cas d'échec : on réessaiera demain plutôt que chaque heure
      await db(`assets?symbol=eq.${encodeURIComponent(a.symbol)}`, { method: "PATCH", body: JSON.stringify({ history_updated_at: new Date(now).toISOString() }) });
    }
    report.history = `${ok}/${stale.length}`;
  }

  // ─── Ménage ───
  await db(`market_series?interval=eq.1h&t=lt.${new Date(now - 10 * 86_400_000).toISOString()}`, { method: "DELETE" });
  await db(`market_series?interval=eq.1d&t=lt.${new Date(now - 400 * 86_400_000).toISOString()}`, { method: "DELETE" });

  return json({ ok: true, ...report });
});
