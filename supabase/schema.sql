-- ─────────────────────────────────────────────────────────────
-- Market Empire — schéma Supabase (Phase 1)
-- Principe anti-triche : le client ne modifie JAMAIS directement l'argent,
-- les positions ou les bâtiments. Il appelle des fonctions (RPC) qui
-- s'exécutent côté serveur, au dernier prix connu du serveur.
-- ─────────────────────────────────────────────────────────────

-- Catalogue d'actifs
create table public.assets (
  symbol          text primary key,
  provider_symbol text not null,
  name            text not null,
  sector          text,
  country         text,
  currency        text not null default 'USD',
  active          boolean not null default true
);

-- Dernier prix connu (rempli par un worker planifié, en €)
create table public.asset_prices (
  symbol     text primary key references public.assets(symbol),
  price      numeric(14,4) not null check (price > 0),
  change_1d  numeric(10,6),
  source     text not null,
  updated_at timestamptz not null default now()
);

-- Historique (bougies) pour les graphiques
create table public.price_history (
  symbol text references public.assets(symbol),
  t      timestamptz not null,
  price  numeric(14,4) not null,
  primary key (symbol, t)
);

-- Joueur (1 ligne par compte)
create table public.players (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  city_name   text not null default 'Nova City',
  cash        numeric(16,2) not null default 100000,
  population  integer not null default 250,
  day         integer not null default 1,
  last_tick   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table public.holdings (
  player_id uuid references public.players(id) on delete cascade,
  symbol    text references public.assets(symbol),
  qty       numeric(18,6) not null check (qty > 0),
  avg_cost  numeric(14,4) not null,
  primary key (player_id, symbol)
);

create table public.transactions (
  id        bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  at        timestamptz not null default now(),
  kind      text not null check (kind in ('buy','sell','build','demolish')),
  symbol    text,
  qty       numeric(18,6),
  price     numeric(14,4),
  amount    numeric(16,2) not null,
  label     text not null
);
create index on public.transactions (player_id, at desc);

-- Types de bâtiments (miroir de src/lib/game/config.ts)
create table public.building_types (
  id          text primary key,
  name        text not null,
  category    text not null,
  cost        numeric(14,2) not null,
  housing     integer not null default 0,
  jobs        integer not null default 0,
  revenue     numeric(12,2) not null default 0,
  energy_prod integer not null default 0,
  energy_use  integer not null default 0,
  food_prod   integer not null default 0,
  unlock_pop  integer not null default 0,
  buildable   boolean not null default true
);

create table public.player_buildings (
  player_id   uuid references public.players(id) on delete cascade,
  building_id text references public.building_types(id),
  count       integer not null check (count >= 0),
  primary key (player_id, building_id)
);

-- Instantanés quotidiens (graphiques de l'onglet Économie)
create table public.snapshots (
  player_id  uuid references public.players(id) on delete cascade,
  day        integer not null,
  at         timestamptz not null default now(),
  net_worth  numeric(16,2) not null,
  cash       numeric(16,2) not null,
  portfolio  numeric(16,2) not null,
  city_value numeric(16,2) not null,
  population integer not null,
  income     numeric(12,2) not null,
  expenses   numeric(12,2) not null,
  primary key (player_id, day)
);

-- ─── Sécurité : lecture seule pour le joueur, écriture via RPC ───
alter table public.assets           enable row level security;
alter table public.asset_prices     enable row level security;
alter table public.price_history    enable row level security;
alter table public.building_types   enable row level security;
alter table public.players          enable row level security;
alter table public.holdings         enable row level security;
alter table public.transactions     enable row level security;
alter table public.player_buildings enable row level security;
alter table public.snapshots        enable row level security;

create policy "catalogue lisible" on public.assets          for select to authenticated using (true);
create policy "prix lisibles"     on public.asset_prices    for select to authenticated using (true);
create policy "historique lisible" on public.price_history  for select to authenticated using (true);
create policy "bâtiments lisibles" on public.building_types for select to authenticated using (true);
create policy "mon joueur"        on public.players          for select to authenticated using (id = auth.uid());
create policy "mes positions"     on public.holdings         for select to authenticated using (player_id = auth.uid());
create policy "mes opérations"    on public.transactions     for select to authenticated using (player_id = auth.uid());
create policy "ma ville"          on public.player_buildings for select to authenticated using (player_id = auth.uid());
create policy "mes instantanés"   on public.snapshots        for select to authenticated using (player_id = auth.uid());
-- Aucune policy insert/update/delete : seules les fonctions ci-dessous écrivent.

-- ─── RPC : ordre de bourse ────────────────────────────────────
create or replace function public.trade(p_symbol text, p_qty numeric, p_side text)
returns public.players
language plpgsql security definer set search_path = public as $$
declare
  v_player  public.players;
  v_price   numeric;
  v_gross   numeric;
  v_fee     numeric;
  v_holding public.holdings;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantité invalide'; end if;
  if p_side not in ('buy','sell') then raise exception 'Sens invalide'; end if;

  select * into v_player from players where id = auth.uid() for update;
  if not found then raise exception 'Joueur introuvable'; end if;

  -- Prix du serveur, jamais celui envoyé par le client ; refusé s'il est trop ancien
  select price into v_price from asset_prices
   where symbol = p_symbol and updated_at > now() - interval '30 minutes';
  if v_price is null then raise exception 'Prix indisponible'; end if;

  v_gross := round(p_qty * v_price, 2);
  v_fee   := greatest(1, round(v_gross * 0.001, 2));

  if p_side = 'buy' then
    if v_gross + v_fee > v_player.cash then raise exception 'Liquidités insuffisantes'; end if;
    update players set cash = cash - v_gross - v_fee where id = v_player.id returning * into v_player;
    insert into holdings (player_id, symbol, qty, avg_cost) values (v_player.id, p_symbol, p_qty, v_price)
    on conflict (player_id, symbol) do update
      set avg_cost = (holdings.qty * holdings.avg_cost + excluded.qty * excluded.avg_cost) / (holdings.qty + excluded.qty),
          qty = holdings.qty + excluded.qty;
    insert into transactions (player_id, kind, symbol, qty, price, amount, label)
    values (v_player.id, 'buy', p_symbol, p_qty, v_price, -(v_gross + v_fee), format('Achat %s × %s', p_qty, p_symbol));
  else
    select * into v_holding from holdings where player_id = v_player.id and symbol = p_symbol for update;
    if not found or v_holding.qty < p_qty then raise exception 'Quantité insuffisante'; end if;
    if v_holding.qty = p_qty then
      delete from holdings where player_id = v_player.id and symbol = p_symbol;
    else
      update holdings set qty = qty - p_qty where player_id = v_player.id and symbol = p_symbol;
    end if;
    update players set cash = cash + v_gross - v_fee where id = v_player.id returning * into v_player;
    insert into transactions (player_id, kind, symbol, qty, price, amount, label)
    values (v_player.id, 'sell', p_symbol, p_qty, v_price, v_gross - v_fee, format('Vente %s × %s', p_qty, p_symbol));
  end if;
  return v_player;
end $$;

-- ─── RPC : construction ───────────────────────────────────────
create or replace function public.build(p_building text)
returns public.players
language plpgsql security definer set search_path = public as $$
declare
  v_player public.players;
  v_type   public.building_types;
begin
  select * into v_player from players where id = auth.uid() for update;
  select * into v_type from building_types where id = p_building and buildable;
  if not found then raise exception 'Bâtiment inconnu'; end if;
  if v_player.population < v_type.unlock_pop then raise exception 'Débloqué à % habitants', v_type.unlock_pop; end if;
  if v_type.cost > v_player.cash then raise exception 'Liquidités insuffisantes'; end if;

  update players set cash = cash - v_type.cost where id = v_player.id returning * into v_player;
  insert into player_buildings values (v_player.id, v_type.id, 1)
  on conflict (player_id, building_id) do update set count = player_buildings.count + 1;
  insert into transactions (player_id, kind, amount, label)
  values (v_player.id, 'build', -v_type.cost, 'Construction : ' || v_type.name);
  return v_player;
end $$;

revoke all on function public.trade(text, numeric, text) from public, anon;
revoke all on function public.build(text) from public, anon;
grant execute on function public.trade(text, numeric, text) to authenticated;
grant execute on function public.build(text) to authenticated;

-- Le « tick » quotidien de la ville (moteur de src/lib/game/engine.ts) sera
-- exécuté par une Edge Function planifiée (pg_cron) avec la clé service.
