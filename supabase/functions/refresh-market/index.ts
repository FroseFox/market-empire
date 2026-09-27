// Market Empire — mise à jour des cours (Supabase Edge Function « refresh-market »).
// Appelée chaque heure par pg_cron. Peut aussi être appelée à la main : elle ne
// travaille que si les cours ont plus de 50 minutes, donc impossible d'épuiser les quotas.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   FINNHUB_API_KEY      cours en temps quasi réel
//   TWELVE_DATA_API_KEY  historique quotidien (1 mois / 1 an), rafraîchi une fois par jour
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FINNHUB = Deno.env.get("FINNHUB_API_KEY") ?? "";
const TWELVE = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const MIN_GAP_MS = 50 * 60_000;
const HISTORY_BATCH = 7; // offre gratuite Twelve Data : 8 requêtes / minute

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

  const assets = (await (await db("assets?select=symbol,provider_symbol,history_updated_at&active=eq.true")).json()) as
    { symbol: string; provider_symbol: string; history_updated_at: string | null }[];

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
    for (const a of assets) {
      const q = await getJson<{ c?: number; dp?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(a.provider_symbol)}&token=${FINNHUB}`);
      if (q?.c && q.c > 0) {
        const price = round4(q.c * (quoteCurrency(a.provider_symbol) === "USD" ? fx : 1));
        prices.push({ symbol: a.symbol, price, change_1d: (q.dp ?? 0) / 100, source: "finnhub", updated_at: new Date(now).toISOString() });
        // Un point par heure, seulement si le cours a bougé (marché ouvert)
        if (prevPrice.get(a.symbol) !== price) points.push({ symbol: a.symbol, interval: "1h", t: hour, price });
      }
      await sleep(1100); // offre gratuite : 60 requêtes / minute
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
      const j = await getJson<{ status?: string; meta?: { currency?: string }; values?: { datetime: string; close: string }[] }>(
        `https://api.twelvedata.com/time_series?${twelveSymbol(a.provider_symbol)}&interval=1day&outputsize=260&timezone=UTC&apikey=${TWELVE}`, 15_000);
      if (j?.status === "ok" && j.values?.length) {
        const rate = (j.meta?.currency ?? quoteCurrency(a.provider_symbol)) === "USD" ? fx : 1;
        const rows = j.values
          .map((v) => ({ symbol: a.symbol, interval: "1d", t: `${v.datetime.slice(0, 10)}T00:00:00Z`, price: round4(Number(v.close) * rate) }))
          .filter((r) => r.price > 0);
        await db("market_series", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) });
        ok++;
      }
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
