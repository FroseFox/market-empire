-- Market Empire — plusieurs villes par pays (un pays devient une région).
-- Avant : un seul joueur par pays, donc 56 joueurs au maximum. Après : 20 villes par pays, soit 1 120 joueurs,
-- et tous les joueurs d'un pays profitent de sa spécialité.
-- Rien n'est supprimé : les joueurs gardent leur pays, l'ancienne fonction join_world reste en place.
-- Tant que ce fichier n'est pas appliqué, le jeu fonctionne comme avant (un joueur par pays).

-- 1) Un pays peut accueillir plusieurs joueurs : on retire l'unicité sur players.country (quel que soit son nom).
do $$
declare
  col smallint := (select attnum from pg_attribute where attrelid = 'public.players'::regclass and attname = 'country');
  r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.players'::regclass and contype = 'u' and conkey = array[col] loop
    execute format('alter table public.players drop constraint %I', r.conname);
  end loop;
  for r in select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
           where i.indrelid = 'public.players'::regclass and i.indisunique and not i.indisprimary
             and i.indnatts = 1 and i.indkey[0] = col loop
    execute format('drop index public.%I', r.relname);
  end loop;
end $$;
create index if not exists players_country_idx on public.players (country);

-- Pays jouables et nombre de villes par pays (mêmes valeurs que lib/world/countries.ts et CITIES_PER_COUNTRY).
create or replace function public.playable_countries()
returns text[] language sql immutable as $$
  select array['124','840','484','076','032','152','170','604','862','826','250','724','620','276','380','528','056','756','040','616','752','578','246','208','300','792','642','804','203','348','372','643','398','156','392','410','356','360','764','704','458','608','586','682','784','376','818','504','012','566','710','404','231','288','036','554']
$$;
create or replace function public.cities_per_country()
returns integer language sql immutable as $$ select 20 $$;

-- 2) Arrivée d'un joueur : l'ancienne fonction crée le profil et donne un pays vide s'il en reste ;
--    sinon le joueur rejoint le pays le moins peuplé (à égalité : le premier de son ordre de préférence).
--    Si tous les pays sont complets, il rejoint quand même le moins peuplé : personne n'est refusé.
create or replace function public.join_world_v2(p_countries text[])
returns table (country text) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  has_row boolean := false;
  mine text;
  pick text;
  meta jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  begin
    perform public.join_world(p_countries);
  exception when others then null; -- l'ancienne fonction ne sait pas placer un joueur quand aucun pays n'est vide
  end;
  select true, p.country into has_row, mine from public.players p where p.id = me;
  has_row := coalesce(has_row, false);
  if has_row and mine is not null then
    return query select mine;
    return;
  end if;

  select c.id into pick
  from unnest(coalesce(p_countries, public.playable_countries())) with ordinality as c(id, ord)
  left join (select p.country as id, count(*) as n from public.players p where p.country is not null group by p.country) k on k.id = c.id
  where c.id = any (public.playable_countries())
  order by (coalesce(k.n, 0) >= public.cities_per_country()), coalesce(k.n, 0), c.ord
  limit 1;
  if pick is null then pick := '250'; end if;

  if has_row then
    update public.players p set country = pick, updated_at = now() where p.id = me;
  else
    select u.raw_user_meta_data into meta from auth.users u where u.id = me;
    insert into public.players (id, name, avatar, country)
    values (
      me,
      left(coalesce(nullif(btrim(meta -> 'custom_claims' ->> 'global_name'), ''), nullif(btrim(meta ->> 'full_name'), ''), nullif(btrim(meta ->> 'name'), ''), 'Joueur'), 40),
      case when meta ->> 'avatar_url' like 'https://cdn.discordapp.com/%' then meta ->> 'avatar_url' end,
      pick
    );
  end if;
  return query select pick;
end $$;

-- 3) Déménagement : possible vers tout pays jouable qui a encore une place. Renvoie false si le pays est complet.
create or replace function public.move_country(p_country text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_country is null or not (p_country = any (public.playable_countries())) then return false; end if;
  if (select count(*) from public.players where country = p_country and id <> auth.uid()) >= public.cities_per_country() then return false; end if;
  update public.players set country = p_country, updated_at = now() where id = auth.uid();
  return found;
end $$;

revoke all on function public.join_world_v2(text[]) from public, anon;
revoke all on function public.move_country(text) from public, anon;
grant execute on function public.join_world_v2(text[]) to authenticated;
grant execute on function public.move_country(text) to authenticated;
