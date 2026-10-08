-- Market Empire — bourse des villes : investir dans la ville d'un autre joueur.
-- Additif : quatre colonnes, une table, des fonctions. Rien d'existant n'est modifié.
--
-- Une ville compte 1 000 parts. Son propriétaire en met jusqu'à 490 en vente (49 %) ; le prix d'une part suit
-- le patrimoine publié de la ville (patrimoine / 1 000), sans aucun événement inventé.
-- L'argent ne sort jamais de nulle part : l'acheteur paie le propriétaire, et seul le propriétaire peut racheter
-- ses parts (au prix du jour, payé au détenteur). Les dividendes sont calculés par le jeu des deux côtés,
-- comme les contrats de commerce.
-- Le serveur garantit : on n'achète pas plus que ce qui est en vente, et chaque paiement est crédité une seule fois.

alter table public.players
  add column if not exists income integer not null default 0,          -- flux net quotidien de la ville, hors dividendes
  add column if not exists share_float smallint not null default 0,    -- parts mises en vente par le propriétaire
  add column if not exists share_sold smallint not null default 0,     -- parts détenues par d'autres joueurs
  add column if not exists share_credit bigint not null default 0;     -- total reçu des autres joueurs (ventes, rachats)
do $$ begin
  alter table public.players add constraint players_share_float_check check (share_float between 0 and 490);
  alter table public.players add constraint players_share_sold_check check (share_sold between 0 and 490);
exception when duplicate_object then null; end $$;

create table if not exists public.city_shares (
  city uuid not null references public.players(id) on delete cascade,
  holder uuid not null references public.players(id) on delete cascade,
  qty smallint not null check (qty between 1 and 490),
  cost bigint not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (city, holder),
  check (city <> holder)
);
create index if not exists city_shares_holder on public.city_shares (holder);
-- Aucune lecture ni écriture directe : tout passe par les fonctions ci-dessous.
alter table public.city_shares enable row level security;
revoke all on public.city_shares from anon, authenticated;

-- players.share_sold suit toujours la table (y compris quand un compte est supprimé).
create or replace function public.city_shares_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.players p set share_sold = (select coalesce(sum(s.qty), 0) from public.city_shares s where s.city = old.city) where p.id = old.city;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.players p set share_sold = (select coalesce(sum(s.qty), 0) from public.city_shares s where s.city = new.city) where p.id = new.city;
  end if;
  return null;
end $$;
create or replace trigger city_shares_count after insert or update or delete on public.city_shares
  for each row execute function public.city_shares_count();

-- Prix d'une part : un millième du patrimoine publié (100 000 € de patrimoine au minimum).
create or replace function public.share_price(p_net_worth bigint)
returns numeric language sql immutable set search_path = '' as $$ select greatest(coalesce(p_net_worth, 0), 100000) / 1000.0 $$;

-- Publie le flux net quotidien de sa ville (hors dividendes) : il sert au calcul des dividendes.
create or replace function public.publish_income(p_income integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.players p set income = greatest(-100000000, least(coalesce(p_income, 0), 1000000000)) where p.id = auth.uid();
  return found;
end $$;

-- Met des parts de sa ville en vente (0 à 490, jamais moins que ce qui est déjà vendu). Petite ville au minimum.
create or replace function public.set_share_float(p_float integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_float is null or p_float < 0 or p_float > 490 then return false; end if;
  update public.players p set share_float = p_float
    where p.id = auth.uid() and p.share_sold <= p_float and (p.population >= 1500 or p_float <= p.share_float) and not p.flagged;
  return found;
end $$;

-- Achète des parts d'une autre ville. Renvoie le prix payé (crédité au propriétaire), ou null si c'est impossible :
-- plus assez de parts en vente, prix au-dessus de p_max_cost, ville trop petite, trop de lignes.
create or replace function public.buy_city_shares(p_city uuid, p_qty integer, p_max_cost bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c public.players%rowtype;
  v_cost bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_city is null or p_city = me or p_qty is null or p_qty < 1 or p_qty > 490 then return null; end if;
  if not exists (select 1 from public.players p where p.id = me and not p.flagged and p.population >= 1500) then return null; end if;
  if (select count(*) from public.city_shares s where s.holder = me and s.city <> p_city) >= 12 then return null; end if;
  -- Verrou sur la ville : deux acheteurs ne se partagent pas les mêmes parts
  select * into c from public.players p where p.id = p_city for update;
  if not found or c.flagged or c.share_sold + p_qty > c.share_float then return null; end if;
  v_cost := ceil(public.share_price(c.net_worth) * p_qty);
  if p_max_cost is null or v_cost > p_max_cost then return null; end if;
  insert into public.city_shares as s (city, holder, qty, cost) values (p_city, me, p_qty, v_cost)
    on conflict (city, holder) do update set qty = s.qty + excluded.qty, cost = s.cost + excluded.cost, updated_at = now();
  update public.players p set share_credit = p.share_credit + v_cost where p.id = p_city;
  return v_cost;
end $$;

-- Rachète des parts de sa propre ville à un détenteur, au prix du jour. Renvoie le prix payé (crédité au détenteur).
create or replace function public.buyback_city_shares(p_holder uuid, p_qty integer, p_max_cost bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c public.players%rowtype;
  s public.city_shares%rowtype;
  v_cost bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_holder is null or p_holder = me or p_qty is null or p_qty < 1 then return null; end if;
  select * into c from public.players p where p.id = me for update;
  if not found then return null; end if;
  select * into s from public.city_shares x where x.city = me and x.holder = p_holder for update;
  if not found or s.qty < p_qty then return null; end if;
  v_cost := ceil(public.share_price(c.net_worth) * p_qty);
  if p_max_cost is null or v_cost > p_max_cost then return null; end if;
  if s.qty = p_qty then
    delete from public.city_shares x where x.city = me and x.holder = p_holder;
  else
    update public.city_shares x set qty = x.qty - p_qty, cost = round(x.cost * (x.qty - p_qty)::numeric / x.qty), updated_at = now()
      where x.city = me and x.holder = p_holder;
  end if;
  update public.players p set share_credit = p.share_credit + v_cost where p.id = p_holder;
  return v_cost;
end $$;

-- Tout ce qui concerne ses parts, en un seul appel : crédits reçus, parts en vente, parts détenues, actionnaires.
create or replace function public.sync_shares()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select jsonb_build_object(
    'credit', p.share_credit, 'float', p.share_float, 'sold', p.share_sold,
    'held', coalesce((select jsonb_agg(jsonb_build_object('city', s.city, 'name', o.city_name, 'qty', s.qty, 'cost', s.cost, 'net_worth', o.net_worth, 'income', o.income) order by s.cost desc)
      from public.city_shares s join public.players o on o.id = s.city where s.holder = me), '[]'::jsonb),
    'holders', coalesce((select jsonb_agg(jsonb_build_object('holder', s.holder, 'name', h.city_name, 'qty', s.qty) order by s.qty desc)
      from public.city_shares s join public.players h on h.id = s.holder where s.city = me), '[]'::jsonb))
  into r from public.players p where p.id = me;
  return r;
end $$;

-- Nouvelle partie (« recommencer ») : le joueur rend les parts qu'il détenait, sans contrepartie.
create or replace function public.drop_my_shares()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.city_shares s where s.holder = auth.uid();
  return true;
end $$;

revoke all on function public.city_shares_count() from public, anon, authenticated;
revoke all on function public.drop_my_shares() from public, anon;
grant execute on function public.drop_my_shares() to authenticated;
revoke all on function public.share_price(bigint) from public, anon, authenticated;
revoke all on function public.publish_income(integer) from public, anon;
revoke all on function public.set_share_float(integer) from public, anon;
revoke all on function public.buy_city_shares(uuid, integer, bigint) from public, anon;
revoke all on function public.buyback_city_shares(uuid, integer, bigint) from public, anon;
revoke all on function public.sync_shares() from public, anon;
grant execute on function public.publish_income(integer) to authenticated;
grant execute on function public.set_share_float(integer) to authenticated;
grant execute on function public.buy_city_shares(uuid, integer, bigint) to authenticated;
grant execute on function public.buyback_city_shares(uuid, integer, bigint) to authenticated;
grant execute on function public.sync_shares() to authenticated;
