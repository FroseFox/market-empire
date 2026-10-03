-- Market Empire — commerce entre joueurs : contrats d'énergie et de nourriture.
-- Additif : une colonne, une table, une vue, trois fonctions.
-- Le prix (85 % du prix plein, entre l'export à 70 % et l'import à 100 %) est appliqué par le jeu des deux côtés ;
-- le serveur garantit seulement qu'on ne vend pas plus que le surplus annoncé.

-- Surplus quotidien annoncé par chaque joueur : {"energy": n, "food": n}
alter table public.players add column if not exists offer jsonb;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  seller uuid not null references public.players(id) on delete cascade,
  buyer uuid not null references public.players(id) on delete cascade,
  resource text not null check (resource in ('energy', 'food')),
  qty integer not null check (qty between 1 and 10000000),
  created_at timestamptz not null default now(),
  check (seller <> buyer)
);
create index if not exists contracts_seller on public.contracts (seller);
create index if not exists contracts_buyer on public.contracts (buyer);

-- Chacun ne lit que ses propres contrats ; aucune écriture directe.
alter table public.contracts enable row level security;
drop policy if exists contracts_own on public.contracts;
create policy contracts_own on public.contracts for select to authenticated using (auth.uid() in (seller, buyer));
revoke all on public.contracts from anon, authenticated;
grant select on public.contracts to authenticated;

-- Marché public : ce que chaque joueur peut encore vendre (surplus annoncé moins ce qui est déjà sous contrat).
create or replace view public.market as
  select p.id, p.name, p.city_name, p.country,
    greatest(0, coalesce((p.offer->>'energy')::int, 0) - coalesce((select sum(c.qty) from public.contracts c where c.seller = p.id and c.resource = 'energy'), 0))::int as energy,
    greatest(0, coalesce((p.offer->>'food')::int, 0) - coalesce((select sum(c.qty) from public.contracts c where c.seller = p.id and c.resource = 'food'), 0))::int as food
  from public.players p
  where p.offer is not null;
grant select on public.market to anon, authenticated;

-- Annonce son surplus du jour.
create or replace function public.publish_offer(p_energy integer, p_food integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.players
    set offer = jsonb_build_object('energy', greatest(0, least(coalesce(p_energy, 0), 10000000)), 'food', greatest(0, least(coalesce(p_food, 0), 10000000)))
    where id = auth.uid();
  return found;
end $$;

-- Signe un contrat d'achat auprès d'un autre joueur. Renvoie l'identifiant, ou null si ce n'est plus possible.
create or replace function public.sign_contract(p_seller uuid, p_resource text, p_qty integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_offer jsonb; v_taken bigint; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_seller is null or p_seller = auth.uid() or p_resource not in ('energy', 'food') or p_qty is null or p_qty < 1 then return null; end if;
  if not exists (select 1 from public.players where id = auth.uid()) then return null; end if;
  -- Au plus 6 contrats d'achat par joueur
  if (select count(*) from public.contracts where buyer = auth.uid()) >= 6 then return null; end if;
  -- Verrou sur le vendeur : deux acheteurs ne se partagent pas le même surplus
  select offer into v_offer from public.players where id = p_seller for update;
  if v_offer is null then return null; end if;
  select coalesce(sum(qty), 0) into v_taken from public.contracts where seller = p_seller and resource = p_resource;
  if p_qty > coalesce((v_offer->>p_resource)::int, 0) - v_taken then return null; end if;
  insert into public.contracts (seller, buyer, resource, qty) values (p_seller, auth.uid(), p_resource, p_qty) returning id into v_id;
  return v_id;
end $$;

-- Résilie un contrat (l'acheteur comme le vendeur peuvent le faire).
create or replace function public.cancel_contract(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.contracts where id = p_id and auth.uid() in (seller, buyer);
  return found;
end $$;

revoke all on function public.publish_offer(integer, integer) from public, anon;
revoke all on function public.sign_contract(uuid, text, integer) from public, anon;
revoke all on function public.cancel_contract(uuid) from public, anon;
grant execute on function public.publish_offer(integer, integer) to authenticated;
grant execute on function public.sign_contract(uuid, text, integer) to authenticated;
grant execute on function public.cancel_contract(uuid) to authenticated;
