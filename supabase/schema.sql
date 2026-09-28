-- ─────────────────────────────────────────────────────────────
-- Market Empire — schéma Supabase (référence ; appliqué par migrations)
-- Le site est statique : il lit les cours et les actualités (lecture publique)
-- et n'écrit que via des fonctions contrôlées côté serveur (compte Discord).
-- ─────────────────────────────────────────────────────────────

-- ─── Marchés (écrits uniquement par la fonction refresh-market) ───
create table public.assets (
  symbol text primary key,
  provider_symbol text not null,          -- symbole Finnhub
  name text not null, sector text, country text,
  currency text not null default 'USD',
  kind text not null default 'stock',     -- stock | etf | commodity | crypto
  us_symbol text, us_factor numeric,      -- société étrangère : cotation américaine × facteur
  coingecko_id text,                      -- cryptomonnaies
  active boolean not null default true,
  history_updated_at timestamptz
);
create table public.asset_prices (
  symbol text primary key references public.assets(symbol),
  price numeric(14,4) not null check (price > 0),
  change_1d numeric(10,6), source text, updated_at timestamptz not null default now()
);
create table public.market_series (
  symbol text not null references public.assets(symbol),
  interval text not null check (interval in ('1h', '1d')),
  t timestamptz not null,
  price numeric(14,4) not null check (price > 0),
  primary key (symbol, interval, t)
);

-- ─── Actualités (écrites uniquement par la fonction refresh-news) ───
create table public.news (
  id text primary key, title text not null check (char_length(title) <= 300),
  url text not null check (url like 'https://%'), source text not null default '',
  published_at timestamptz not null, symbols text[] not null default '{}',
  topic text not null default 'Marchés', country text not null default '',
  created_at timestamptz not null default now()
);

-- ─── Joueurs (compte Discord via Supabase Auth) ───
create table public.players (             -- profil public : classement et carte
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null, avatar text, country text unique,
  city_name text not null default 'Ma ville', net_worth bigint not null default 0,
  population integer not null default 0, perf real not null default 0, day integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.saves (               -- sauvegarde privée, une ligne par joueur
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (pg_column_size(data) <= 131072),
  saved_at bigint not null, updated_at timestamptz not null default now()
);

-- ─── Droits ───
-- Lecture publique : assets, asset_prices, market_series, news, players.
-- saves : lecture de SA ligne uniquement (authenticated). Aucune écriture directe :
--   join_world(p_countries text[])  → crée le profil (nom et avatar lus depuis Discord), attribue un pays libre
--   save_game(p_data, p_saved_at, p_city, p_net_worth, p_population, p_perf, p_day) → sauvegarde + classement,
--                                     refusée si la précédente date de moins de 20 s
--   delete_me()                      → supprime le compte et ses données

-- ─── Tâches planifiées (pg_cron + pg_net) ───
-- refresh-market : '5,7,9,11,13 * * * *'  → chaque cours rafraîchi une fois par heure (lots de 45)
-- refresh-news   : '35 * * * *'           → actualités une fois par heure
