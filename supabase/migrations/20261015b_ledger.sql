-- Registre des mouvements d'argent décidés par le serveur.
-- Avant : le serveur enregistrait l'action (parts achetées, versement à l'alliance, récompense commune) et le jeu
-- retirait ou ajoutait l'argent de son côté, enregistré jusqu'à 5 minutes plus tard. Si la partie était remplacée entre-
-- temps (autre appareil, sauvegarde refusée, appli fermée), l'argent disparaissait ou n'était jamais retiré.
-- Maintenant : l'action et sa ligne de registre sont écrites ensemble, dans la même opération ; le jeu applique chaque
-- ligne une seule fois (la partie retient le numéro de la dernière appliquée), même après un changement d'appareil.
create table if not exists public.player_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null,
  label text not null,
  kind text not null check (kind in ('shares', 'alliance', 'reward')),
  at timestamptz not null default now()
);
create index if not exists player_ledger_user_idx on public.player_ledger (user_id, id);
alter table public.player_ledger enable row level security;
create policy "player_ledger: le sien" on public.player_ledger for select to authenticated using (user_id = (select auth.uid()));

-- Dernière ligne du registre (point de départ d'une partie qui n'en a encore appliqué aucune)
create or replace function public.ledger_head() returns bigint language sql stable security definer set search_path to '' as $$
  select coalesce(max(id), 0) from public.player_ledger where user_id = auth.uid();
$$;

create or replace function public.ledger_add(p_amount numeric, p_label text, p_kind text) returns void language sql security definer set search_path to '' as $$
  insert into public.player_ledger (user_id, amount, label, kind) values (auth.uid(), p_amount, left(p_label, 120), p_kind);
$$;
revoke all on function public.ledger_add(numeric, text, text) from public, anon, authenticated;

-- Enveloppes : l'action d'origine, puis sa ligne de registre
create or replace function public.buy_city_shares_l(p_city uuid, p_qty integer, p_max_cost bigint, p_label text) returns bigint
language plpgsql security definer set search_path to '' as $$
declare c bigint;
begin
  c := public.buy_city_shares(p_city, p_qty, p_max_cost);
  if coalesce(c, 0) > 0 then perform public.ledger_add(-c, p_label, 'shares'); end if;
  return c;
end $$;

create or replace function public.hostile_bid_l(p_city uuid, p_max_cost bigint, p_label text) returns bigint
language plpgsql security definer set search_path to '' as $$
declare c bigint;
begin
  c := public.hostile_bid(p_city, p_max_cost);
  if coalesce(c, 0) > 0 then perform public.ledger_add(-c, p_label, 'shares'); end if;
  return c;
end $$;

create or replace function public.buyback_city_shares_l(p_holder uuid, p_qty integer, p_max_cost bigint, p_label text) returns bigint
language plpgsql security definer set search_path to '' as $$
declare c bigint;
begin
  c := public.buyback_city_shares(p_holder, p_qty, p_max_cost);
  if coalesce(c, 0) > 0 then perform public.ledger_add(-c, p_label, 'shares'); end if;
  return c;
end $$;

-- Fonder une alliance : prix fixe (ALLIANCE.cost dans le jeu)
create or replace function public.create_alliance_l(p_name text, p_tag text) returns uuid
language plpgsql security definer set search_path to '' as $$
declare a uuid;
begin
  a := public.create_alliance(p_name, p_tag);
  if a is not null then perform public.ledger_add(-250000, 'Alliance fondée : ' || btrim(p_name), 'alliance'); end if;
  return a;
end $$;

create or replace function public.contribute_alliance_l(p_amount bigint) returns bigint
language plpgsql security definer set search_path to '' as $$
declare t bigint;
begin
  t := public.contribute_alliance(p_amount);
  if t is not null then perform public.ledger_add(-p_amount, 'Versement à la caisse de l''alliance', 'alliance'); end if;
  return t;
end $$;

-- Objectif commun : la récompense dépend de la ville (calculée par le jeu), plafonnée à 3 × 150 000 €
create or replace function public.world_goal_claim_l(p_id bigint, p_amount numeric, p_label text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if not public.world_goal_claim(p_id) then return false; end if;
  perform public.ledger_add(least(greatest(p_amount, 0), 450000), p_label, 'reward');
  return true;
end $$;

revoke all on function public.buy_city_shares_l(uuid, integer, bigint, text) from public, anon;
revoke all on function public.hostile_bid_l(uuid, bigint, text) from public, anon;
revoke all on function public.buyback_city_shares_l(uuid, integer, bigint, text) from public, anon;
revoke all on function public.create_alliance_l(text, text) from public, anon;
revoke all on function public.contribute_alliance_l(bigint) from public, anon;
revoke all on function public.world_goal_claim_l(bigint, numeric, text) from public, anon;
revoke all on function public.ledger_head() from public, anon;
grant execute on function public.buy_city_shares_l(uuid, integer, bigint, text), public.hostile_bid_l(uuid, bigint, text),
  public.buyback_city_shares_l(uuid, integer, bigint, text), public.create_alliance_l(text, text), public.contribute_alliance_l(bigint),
  public.world_goal_claim_l(bigint, numeric, text), public.ledger_head() to authenticated;
