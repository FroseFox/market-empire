-- Filet de sécurité : « Recommencer la partie » ne détruit plus rien pendant 7 jours.
-- Quand une sauvegarde repart du jour 1 par-dessus une partie avancée, la partie d'avant est gardée de côté
-- (une seule, la dernière), avec les chiffres publiés du joueur. Le joueur peut la reprendre depuis le jeu.

alter table public.saves
  add column if not exists backup jsonb,           -- la partie d'avant la remise à zéro
  add column if not exists backup_at timestamptz,  -- quand elle a été mise de côté
  add column if not exists backup_meta jsonb;      -- chiffres publiés à ce moment (classement)

create or replace function public.saves_keep_backup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_day integer := coalesce(nullif(old.data ->> 'day', '')::numeric, 1)::integer;
  new_day integer := coalesce(nullif(new.data ->> 'day', '')::numeric, 1)::integer;
begin
  if new_day <= 2 and old_day > 2 then
    new.backup := old.data;
    new.backup_at := now();
    select jsonb_build_object('city_name', p.city_name, 'net_worth', p.net_worth, 'population', p.population, 'perf', p.perf,
                              'day', p.day, 'nw_ref', p.nw_ref, 'flagged', p.flagged, 'flag_reason', p.flag_reason)
      into new.backup_meta from public.players p where p.id = new.id;
  end if;
  return new;
exception when others then
  return new; -- le filet ne doit jamais empêcher une sauvegarde
end $$;

create or replace trigger saves_backup before update on public.saves
  for each row execute function public.saves_keep_backup();

-- Reprend la partie mise de côté (7 jours au plus). Renvoie false s'il n'y en a pas.
create or replace function public.restore_save()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  b jsonb; m jsonb;
begin
  if uid is null then raise exception 'non connecté'; end if;
  select s.backup, s.backup_meta into b, m from public.saves s
    where s.id = uid and s.backup is not null and s.backup_at > now() - interval '7 days' for update;
  if b is null then return false; end if;
  update public.saves s set data = b, saved_at = (extract(epoch from clock_timestamp()) * 1000)::bigint, updated_at = now(),
    backup = null, backup_at = null, backup_meta = null where s.id = uid;
  if m is not null then
    update public.players p set
      city_name = coalesce(m ->> 'city_name', p.city_name),
      net_worth = coalesce((m ->> 'net_worth')::bigint, p.net_worth),
      population = coalesce((m ->> 'population')::integer, p.population),
      perf = coalesce((m ->> 'perf')::real, p.perf),
      day = coalesce((m ->> 'day')::integer, p.day),
      nw_ref = greatest(coalesce((m ->> 'nw_ref')::bigint, 0), coalesce((m ->> 'net_worth')::bigint, 0), 100000),
      nw_ref_at = now(), updated_at = now()
    where p.id = uid;
    -- Le garde-fou du classement a vu un saut de jours : ici ce n'en est pas un, on remet le signalement d'avant
    update public.players p set flagged = coalesce((m ->> 'flagged')::boolean, false), flag_reason = m ->> 'flag_reason' where p.id = uid;
  end if;
  return true;
end $$;

revoke all on function public.restore_save() from public, anon;
grant execute on function public.restore_save() to authenticated;
revoke all on function public.saves_keep_backup() from public, anon, authenticated;
