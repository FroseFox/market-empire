-- Market Empire — alliances entre villes.
-- Additif : une table, deux colonnes, quatre fonctions. Rien d'existant n'est modifié.
--
-- Une alliance réunit jusqu'à 8 villes. Ses membres alimentent une caisse commune : elle ne se retire pas,
-- elle fait monter le niveau de l'alliance, qui donne un bonus à tous ses membres (calculé par le jeu).
-- Le serveur garantit : le nombre de membres, un seul chef, et le total de la caisse.

create table if not exists public.alliances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[[:alnum:]][[:alnum:] ''-]{1,22}[[:alnum:]]$'),
  tag text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  leader uuid references public.players(id) on delete set null,
  treasury bigint not null default 0 check (treasury >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists alliances_name_key on public.alliances (lower(name));
create unique index if not exists alliances_tag_key on public.alliances (tag);
create index if not exists alliances_leader_idx on public.alliances (leader);

alter table public.players
  add column if not exists alliance uuid references public.alliances(id) on delete set null,
  add column if not exists alliance_gift bigint not null default 0;      -- versé à la caisse de son alliance actuelle
create index if not exists players_alliance_idx on public.players (alliance);

-- Lecture publique (nom, sigle, chef, caisse) ; aucune écriture directe.
alter table public.alliances enable row level security;
do $$ begin
  create policy "alliances publiques" on public.alliances for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
revoke all on public.alliances from anon, authenticated;
grant select on public.alliances to anon, authenticated;

-- Fonde une alliance et en devient le chef. Renvoie son identifiant, ou null si c'est impossible
-- (déjà dans une alliance, ville trop petite, nom ou sigle déjà pris ou invalide).
create or replace function public.create_alliance(p_name text, p_tag text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.players p where p.id = me and p.alliance is null and p.population >= 1500 and not p.flagged) then return null; end if;
  begin
    insert into public.alliances (name, tag, leader) values (btrim(p_name), upper(btrim(p_tag)), me) returning id into v_id;
  exception when unique_violation or check_violation or not_null_violation then
    return null;
  end;
  update public.players p set alliance = v_id, alliance_gift = 0 where p.id = me;
  return v_id;
end $$;

-- Rejoint une alliance qui a encore une place (8 villes au plus). Une alliance sans chef en retrouve un.
create or replace function public.join_alliance(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  a public.alliances%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.players p where p.id = me and p.alliance is null and p.population >= 1500 and not p.flagged) then return false; end if;
  -- Verrou sur l'alliance : deux joueurs ne prennent pas la même dernière place
  select * into a from public.alliances x where x.id = p_id for update;
  if not found then return false; end if;
  if (select count(*) from public.players p where p.alliance = p_id) >= 8 then return false; end if;
  update public.players p set alliance = p_id, alliance_gift = 0 where p.id = me;
  if a.leader is null then update public.alliances x set leader = me where x.id = p_id; end if;
  return true;
end $$;

-- Quitte son alliance. Si c'était le chef, le membre qui a le plus versé à la caisse le remplace.
create or replace function public.leave_alliance()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select p.alliance into v_id from public.players p where p.id = me;
  if v_id is null then return false; end if;
  perform 1 from public.alliances x where x.id = v_id for update;
  update public.players p set alliance = null, alliance_gift = 0 where p.id = me;
  update public.alliances x
    set leader = (select p.id from public.players p where p.alliance = v_id order by p.alliance_gift desc, p.net_worth desc limit 1)
    where x.id = v_id and x.leader = me;
  return true;
end $$;

-- Verse de l'argent à la caisse commune (débité par le jeu). Renvoie le nouveau total, ou null si c'est impossible.
create or replace function public.contribute_alliance(p_amount bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_id uuid;
  v_total bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000000 then return null; end if;
  select p.alliance into v_id from public.players p where p.id = me and not p.flagged;
  if v_id is null then return null; end if;
  update public.alliances x set treasury = least(x.treasury + p_amount, 1000000000000000) where x.id = v_id returning x.treasury into v_total;
  update public.players p set alliance_gift = p.alliance_gift + p_amount where p.id = me;
  return v_total;
end $$;

revoke all on function public.create_alliance(text, text) from public, anon;
revoke all on function public.join_alliance(uuid) from public, anon;
revoke all on function public.leave_alliance() from public, anon;
revoke all on function public.contribute_alliance(bigint) from public, anon;
grant execute on function public.create_alliance(text, text) to authenticated;
grant execute on function public.join_alliance(uuid) to authenticated;
grant execute on function public.leave_alliance() to authenticated;
grant execute on function public.contribute_alliance(bigint) to authenticated;
