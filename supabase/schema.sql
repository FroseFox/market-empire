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
  name text not null, avatar text, country text,                     -- plusieurs villes par pays (20 au plus)
  city_name text not null default 'Ma ville', net_worth bigint not null default 0,
  population integer not null default 0, perf real not null default 0, day integer not null default 1,
  updated_at timestamptz not null default now(),
  city jsonb check (city is null or pg_column_size(city) <= 16384),  -- plan public de la ville (visites)
  offer jsonb,                                                       -- surplus annoncé : {"energy": n, "food": n}
  flagged boolean not null default false, flag_reason text,          -- sauvegarde impossible : retiré du classement
  nw_ref bigint, nw_ref_at timestamptz                               -- référence du garde-fou (migrations/20261003b_ranking_guard.sql)
);
create table public.saves (               -- sauvegarde privée, une ligne par joueur
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (pg_column_size(data) <= 131072),
  saved_at bigint not null, updated_at timestamptz not null default now()
);

-- Commerce entre joueurs (migrations/20261003c_trade.sql) : players.offer (surplus annoncé), table contracts
-- (lecture de SES contrats uniquement), vue public.market, fonctions publish_offer / sign_contract / cancel_contract.
-- Vue public.ranking : players sans les joueurs signalés et sans le plan de ville (c'est elle que lit le classement).
-- Déclencheur players_guard : signale les sauvegardes impossibles (jours en avance, population ou patrimoine impossibles).

-- Bourse des villes (migrations/20261008c_city_shares.sql) : players.income / share_float / share_sold / share_credit,
-- table city_shares (aucun accès direct), fonctions publish_income / set_share_float / buy_city_shares /
-- buyback_city_shares / sync_shares / drop_my_shares.

-- Alliances (migrations/20261008d_alliances.sql) : table alliances (lecture publique), players.alliance / alliance_gift,
-- fonctions create_alliance / join_alliance / leave_alliance / contribute_alliance.

-- ─── Droits ───
-- Lecture publique : assets, asset_prices, market_series, news, players.
-- saves : lecture de SA ligne uniquement (authenticated). Aucune écriture directe :
--   join_world(p_countries text[])  → crée le profil (nom et avatar lus depuis Discord), attribue un pays libre
--   save_game(p_data, p_saved_at, p_city, p_net_worth, p_population, p_perf, p_day) → sauvegarde + classement,
--                                     refusée si la précédente date de moins de 20 s
--   publish_city(p_city jsonb)       → publie le plan de sa ville (migrations/20261003_city_visits_and_moves.sql)
--   join_world_v2(p_countries text[]) → comme join_world, mais place aussi le joueur quand aucun pays n'est vide
--                                     (plusieurs villes par pays, migrations/20261008_cities_per_country.sql)
--   move_country(p_country text)     → déménage dans un pays jouable qui a encore une place (false s'il est complet)
--   delete_me()                      → supprime le compte et ses données

-- ─── Tâches planifiées (pg_cron + pg_net) ───
-- refresh-market : '5,7,9,11,13 * * * *'  → chaque cours rafraîchi une fois par heure (lots de 45)
-- refresh-news   : '35 * * * *'           → actualités une fois par heure
