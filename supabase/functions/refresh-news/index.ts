// Market Empire — actualités automatiques (Supabase Edge Function « refresh-news »).
// Appelée une fois par heure par pg_cron. Lit les flux RSS publics de médias économiques
// français et l'actualité d'entreprises de Finnhub, garde le titre, la source, la date et
// le lien, et relie chaque article aux actifs du jeu cités dans le titre.
// Le contenu des articles n'est jamais copié.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FINNHUB = Deno.env.get("FINNHUB_API_KEY") ?? "";

const KEEP_DAYS = 10;
const MAX_ROWS = 600;
const COMPANY_QUERIES = 8; // entreprises cherchées sur Finnhub à chaque passage (rotation sur tout l'univers)

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

// Flux RSS publics : [adresse, nom affiché, pays par défaut]. Un flux en panne est simplement ignoré.
const FEEDS: [string, string, string][] = [
  ["https://www.lemonde.fr/economie/rss_full.xml", "Le Monde", "FR"],
  ["https://www.francetvinfo.fr/economie.rss", "Franceinfo", "FR"],
  ["https://www.bfmtv.com/rss/economie/", "BFM", "FR"],
  ["https://fr.investing.com/rss/news_25.rss", "Investing.com", ""],
  ["https://fr.investing.com/rss/news_301.rss", "Investing.com", ""],
  ["https://journalducoin.com/feed/", "Journal du Coin", ""],
];

// Autres noms sous lesquels la presse cite un actif (en plus de son nom dans le jeu)
const ALIASES: Record<string, string[]> = {
  NVDA: ["Nvidia"], GOOGL: ["Google"], META: ["Meta", "Facebook", "Instagram"], "BRK.B": ["Berkshire"], TTWO: ["Take-Two", "GTA"],
  TSM: ["TSMC"], NTDOY: ["Nintendo"], TCEHY: ["Tencent"], PDD: ["Temu"], MC: ["LVMH"], OR: ["L'Oréal", "L’Oréal"],
  BNP: ["BNP"], GLE: ["SocGen"], SU: ["Schneider"], RI: ["Pernod"], EL: ["Essilor"], DSY: ["Dassault Systèmes"],
  MBG: ["Mercedes"], VOW3: ["Volkswagen", "VW"], NOVO: ["Novo Nordisk", "Novo"], LLY: ["Lilly"], JPM: ["JPMorgan"],
  XOM: ["Exxon"], MCD: ["McDonald's", "McDonald’s"], PG: ["Procter"], UNH: ["UnitedHealth"], HSBA: ["HSBC"],
  ULVR: ["Unilever"], NESN: ["Nestlé"], ROG: ["Roche"], NOVN: ["Novartis"], UBSG: ["UBS"], SANT: ["Santander"],
  ITX: ["Inditex", "Zara"], IBE: ["Iberdrola"], PHIA: ["Philips"], HEIA: ["Heineken"], INGA: ["ING"], ADS: ["Adidas"],
  SIE: ["Siemens"], ALV: ["Allianz"], BAYN: ["Bayer"], IFX: ["Infineon"], DTE: ["Deutsche Telekom"], RHM: ["Rheinmetall"],
  DBK: ["Deutsche Bank"], RMS: ["Hermès"], KER: ["Kering", "Gucci"], AI: ["Air Liquide"], DG: ["Vinci"], BN: ["Danone"],
  CS: ["AXA"], ORA: ["Orange"], CAP: ["Capgemini"], RNO: ["Renault"], UBI: ["Ubisoft"], SAF: ["Safran"], ENGI: ["Engie"],
  AIR: ["Airbus"], SAN: ["Sanofi"], TTE: ["TotalEnergies"], GE: ["GE Aerospace"], PLTR: ["Palantir"],
  BTC: ["Bitcoin", "bitcoin", "BTC"], ETH: ["Ethereum", "ether"], SOL: ["Solana"], XRP: ["XRP", "Ripple"], DOGE: ["Dogecoin"],
  BNB: ["Binance"], GLD: ["prix de l'or", "cours de l'or", "once d'or"], USO: ["pétrole", "WTI"], BNO: ["Brent"],
  UNG: ["gaz naturel"], CPER: ["cuivre"], WEAT: ["blé"], URA: ["uranium"], SPY: ["S&P 500"], QQQ: ["Nasdaq"], DIA: ["Dow Jones"],
  CAC: ["CAC 40"],
};

const TOPICS: [RegExp, string][] = [
  [/\b(BCE|Fed|taux directeur|taux d'intérêt|inflation|banque centrale)\b/i, "Banques centrales"],
  [/(bitcoin|crypto|ether\b|blockchain|stablecoin)/i, "Cryptomonnaies"],
  [/(résultats|bénéfice|chiffre d'affaires|trimestre|prévisions|dividende)/i, "Résultats"],
  [/(rachat|acquisition|fusion|OPA\b|rachète)/i, "Fusions et acquisitions"],
  [/(pétrole|\bgaz\b|OPEP|Brent|énergie)/i, "Énergie"],
  [/(matières premières|cuivre|\bblé\b|l'or\b|once d'or|uranium)/i, "Matières premières"],
  [/(\bIA\b|intelligence artificielle|puce|semi-conducteur)/i, "Technologie"],
];

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .trim();
const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ""; };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Item = { title: string; url: string; source: string; published: number };

const statuses: string[] = [];
async function feed(url: string, sourceName: string): Promise<Item[]> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketEmpire/1.0; +https://frosefox.github.io/market-empire/)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    statuses.push(`${sourceName}:${r.status}`);
    if (!r.ok) return [];
    const xml = await r.text();
    const blocks = [...xml.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/g)].slice(0, 40);
    return blocks.map((m) => {
      const it = m[2];
      const href = it.match(/<link[^>]*href="([^"]+)"/)?.[1];
      const link = href ? decode(href) : tag(it, "link") || tag(it, "guid");
      const date = tag(it, "pubDate") || tag(it, "published") || tag(it, "updated") || tag(it, "dc:date");
      return { title: tag(it, "title").replace(/<[^>]+>/g, "").slice(0, 300), url: link, source: sourceName, published: Date.parse(date) };
    }).filter((x) => x.title && /^https:\/\//.test(x.url) && Number.isFinite(x.published));
  } catch (e) { statuses.push(`${sourceName}:${(e as Error)?.name ?? "erreur"}`); return []; }
}

/** Actualité récente d'une entreprise (Finnhub, gratuit ; titres souvent en anglais). */
async function companyNews(symbol: string): Promise<Item[]> {
  if (!FINNHUB) return [];
  const day = (d: number) => new Date(d).toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${day(Date.now() - 3 * 86_400_000)}&to=${day(Date.now())}&token=${FINNHUB}`, { signal: AbortSignal.timeout(8_000) });
    statuses.push(`finnhub:${r.status}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { headline?: string; url?: string; source?: string; datetime?: number }[];
    return (Array.isArray(j) ? j : []).slice(0, 4).map((n) => ({ title: (n.headline ?? "").slice(0, 300), url: n.url ?? "", source: (n.source ?? "Finnhub").slice(0, 80), published: (n.datetime ?? 0) * 1000 }))
      .filter((x) => x.title && /^https:\/\//.test(x.url) && x.published > 0);
  } catch { return []; }
}

Deno.serve(async () => {
  const now = Date.now();
  statuses.length = 0;
  let saved = "";
  const assets = (await (await db("assets?select=symbol,name,kind,sector,country&active=eq.true")).json()) as
    { symbol: string; name: string; kind: string; sector: string; country: string }[];

  // Motifs de recherche des actifs dans les titres (sensibles à la casse : « Orange » ≠ « orange »)
  const matchers = assets.map((a) => {
    const names = [...(ALIASES[a.symbol] ?? []), ...(a.kind === "stock" ? [a.name.replace(/\s*\(.*\)$/, "")] : [])];
    const re = names.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(escapeRe).join("|")})(?=$|[^\\p{L}\\p{N}])`, "u") : null;
    return { a, re };
  }).filter((m) => m.re);

  // Entreprises cherchées ce passage (actions cotées aux États-Unis) : rotation sur toute la liste
  const stocks = (await (await db("assets?select=symbol,provider_symbol,us_symbol&active=eq.true&kind=eq.stock")).json()) as { symbol: string; provider_symbol: string; us_symbol: string | null }[];
  const hourIndex = Math.floor(now / 3_600_000);
  const start = (hourIndex * COMPANY_QUERIES) % Math.max(1, stocks.length);
  const picked = Array.from({ length: Math.min(COMPANY_QUERIES, stocks.length) }, (_, i) => stocks[(start + i) % stocks.length]);

  const rows = new Map<string, Record<string, unknown>>();
  let fetched = 0;
  const results: [Item[], string, string?][] = [];
  const rss = await Promise.all(FEEDS.map(([url, name]) => feed(url, name)));
  rss.forEach((items, k) => results.push([items, FEEDS[k][2]]));
  for (const a of picked) {
    const items = await companyNews(a.us_symbol ?? a.provider_symbol);
    const country = assets.find((x) => x.symbol === a.symbol)?.country ?? "";
    results.push([items, country, a.symbol]);
    await sleep(1_100);
  }
  for (const [items, defaultCountry, forced] of results) {
    fetched += items.length;
    for (const it of items) {
      if (now - it.published > KEEP_DAYS * 86_400_000 || it.published > now + 3_600_000) continue;
      const found = matchers.filter((m) => m.re!.test(it.title)).map((m) => m.a.symbol);
      // Actualité d'entreprise (Finnhub) : gardée seulement si le titre cite vraiment l'entreprise
      if (forced && !found.includes(forced) && !new RegExp(`\\b${escapeRe(forced)}\\b`).test(it.title)) continue;
      const symbols = [...new Set([...(forced ? [forced] : []), ...found])].slice(0, 6);
      const first = assets.find((a) => a.symbol === symbols[0]);
      const topic = TOPICS.find(([re]) => re.test(it.title))?.[1] ?? (first?.kind === "stock" ? first.sector : "Marchés");
      const country = first && /^[A-Z]{2}$/.test(first.country) && first.country !== "WW" ? first.country : defaultCountry;
      const id = await sha(norm(it.title));
      if (!rows.has(id)) {
        rows.set(id, { id, title: it.title, url: it.url, source: it.source, published_at: new Date(it.published).toISOString(), symbols, topic, country });
      }
    }
  }

  if (rows.size) {
    const r = await db("news?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([...rows.values()]) });
    saved = r.ok ? "ok" : `${r.status} ${(await r.text()).slice(0, 200)}`;
  }
  // Ménage : 10 jours au plus, et pas plus de 600 articles
  await db(`news?published_at=lt.${new Date(now - KEEP_DAYS * 86_400_000).toISOString()}`, { method: "DELETE" });
  const old = (await (await db(`news?select=id&order=published_at.desc&offset=${MAX_ROWS}&limit=500`)).json()) as { id: string }[];
  if (Array.isArray(old) && old.length) await db(`news?id=in.(${old.map((o) => o.id).join(",")})`, { method: "DELETE" });

  return json({ ok: true, statuses: statuses.join(","), saved, fetched, kept: rows.size, linked: [...rows.values()].filter((r) => (r.symbols as string[]).length).length });
});
