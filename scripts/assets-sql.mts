// Génère le SQL qui synchronise la table `assets` de Supabase avec src/lib/market/universe.ts.
// Usage : npx tsx scripts/assets-sql.mts > supabase/assets.sql
import { ASSETS } from "../src/lib/market/universe.ts";

const q = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

// Sans source gratuite : l'ETF CAC 40 reste simulé
const INACTIVE = new Set(["CAC"]);

const rows = ASSETS.map((a) => `(${[
  q(a.symbol), q(a.providerSymbol), q(a.name), q(a.sector), q(a.country), q(a.currency), q(a.kind),
  q(a.us?.[0]), a.us ? String(Math.round(a.us[1] * 1e6) / 1e6) : "null", q(a.coingecko), String(!INACTIVE.has(a.symbol)),
].join(", ")})`);

console.log(`insert into public.assets (symbol, provider_symbol, name, sector, country, currency, kind, us_symbol, us_factor, coingecko_id, active) values
${rows.join(",\n")}
on conflict (symbol) do update set
  provider_symbol = excluded.provider_symbol, name = excluded.name, sector = excluded.sector, country = excluded.country,
  currency = excluded.currency, kind = excluded.kind, us_symbol = excluded.us_symbol, us_factor = excluded.us_factor,
  coingecko_id = excluded.coingecko_id, active = excluded.active;
update public.assets set active = false where symbol not in (${ASSETS.map((a) => q(a.symbol)).join(", ")});`);
