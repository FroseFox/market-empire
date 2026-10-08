-- Market Empire — guerre économique : blocus entre alliances et rachat hostile d'une ville. Appliqué sur le projet Market Empire le 8 octobre 2026.
-- Additif : trois colonnes et deux fonctions. Rien n'est détruit dans le jeu : la guerre ne touche que l'argent.
--
-- Blocus : le chef d'une alliance paie avec la caisse commune pour bloquer le commerce d'une autre alliance
--   pendant 3 jours réels. La cible est ensuite protégée 10 jours. Les effets sont calculés par le jeu.
-- Rachat hostile : un joueur qui détient déjà 200 parts d'une ville peut forcer la vente des parts restantes
--   (jusqu'à 490 au total), payées 1,5 fois leur prix au propriétaire. Une ville qui n'a jamais vendu de parts
--   ne peut donc pas être visée, et deux villes de la même alliance ne peuvent pas se racheter.

alter table public.alliances
  add column if not exists blockade_target uuid references public.alliances(id) on delete set null,
  add column if not exists blockade_until timestamptz,
  add column if not exists shield_until timestamptz;
create index if not exists alliances_blockade_target_idx on public.alliances (blockade_target);

-- Déclare un blocus contre une autre alliance. Renvoie false si c'est impossible : pas le chef, caisse insuffisante,
-- blocus déjà en cours, cible protégée.
create or replace function public.declare_blockade(p_target uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_mine uuid;
  a public.alliances%rowtype;
  t public.alliances%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select p.alliance into v_mine from public.players p where p.id = me and not p.flagged;
  if v_mine is null or p_target is null or p_target = v_mine then return false; end if;
  -- Verrou sur les deux alliances, toujours dans le même ordre
  perform 1 from public.alliances x where x.id in (v_mine, p_target) order by x.id for update;
  select * into a from public.alliances x where x.id = v_mine;
  select * into t from public.alliances x where x.id = p_target;
  if a.id is null or t.id is null or a.leader is distinct from me then return false; end if;
  if a.treasury < 1000000 or (a.blockade_until is not null and a.blockade_until > now()) then return false; end if;
  if t.shield_until is not null and t.shield_until > now() then return false; end if;
  update public.alliances x set treasury = x.treasury - 1000000, blockade_target = p_target, blockade_until = now() + interval '3 days' where x.id = v_mine;
  update public.alliances x set shield_until = now() + interval '10 days' where x.id = p_target;
  return true;
end $$;

-- Rachat hostile : force la vente des parts restantes d'une ville dont on détient déjà 200 parts.
-- Renvoie le prix payé (crédité au propriétaire), ou null si c'est impossible.
create or replace function public.hostile_bid(p_city uuid, p_max_cost bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_mine uuid;
  c public.players%rowtype;
  v_held integer;
  v_qty integer;
  v_cost bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_city is null or p_city = me then return null; end if;
  select p.alliance into v_mine from public.players p where p.id = me and not p.flagged;
  if not found then return null; end if;
  select * into c from public.players p where p.id = p_city for update;
  if not found or c.flagged then return null; end if;
  if v_mine is not null and c.alliance = v_mine then return null; end if;
  select s.qty into v_held from public.city_shares s where s.city = p_city and s.holder = me for update;
  if v_held is null or v_held < 200 then return null; end if;
  v_qty := 490 - c.share_sold;
  if v_qty < 1 then return null; end if;
  v_cost := ceil(public.share_price(c.net_worth) * v_qty * 1.5);
  if p_max_cost is null or v_cost > p_max_cost then return null; end if;
  update public.players p set share_float = 490, share_credit = p.share_credit + v_cost where p.id = p_city;
  update public.city_shares s set qty = s.qty + v_qty, cost = s.cost + v_cost, updated_at = now() where s.city = p_city and s.holder = me;
  return v_cost;
end $$;

revoke all on function public.declare_blockade(uuid) from public, anon;
revoke all on function public.hostile_bid(uuid, bigint) from public, anon;
grant execute on function public.declare_blockade(uuid) to authenticated;
grant execute on function public.hostile_bid(uuid, bigint) to authenticated;
