-- Notifications du jeu (cloche) liées au compte : la même liste sur tous les appareils, lues ou effacées partout.
-- Chaque appareil crée les siennes ; le même événement vu sur deux appareils a le même identifiant : une seule ligne.
-- 30 dernières gardées par joueur. Aussi : nettoyage du journal des sauvegardes refusées (30 jours).
create table if not exists public.player_notifs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  at timestamptz not null,
  title text not null,
  body text not null,
  href text not null,
  tone text not null check (tone in ('good', 'bad', 'info')),
  read boolean not null default false,
  primary key (user_id, id)
);
create index if not exists player_notifs_at_idx on public.player_notifs (user_id, at desc);
alter table public.player_notifs enable row level security;
-- Aucune règle d'accès : on ne passe que par les fonctions ci-dessous.

create or replace function public.notifs_add(p_id text, p_at bigint, p_title text, p_body text, p_href text, p_tone text) returns void
language plpgsql security definer set search_path to '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_tone not in ('good', 'bad', 'info') then return; end if;
  insert into public.player_notifs (user_id, id, at, title, body, href, tone)
  values (uid, left(p_id, 120), least(to_timestamp(p_at / 1000.0), now()), left(p_title, 120), left(p_body, 240), left(p_href, 60), p_tone)
  on conflict do nothing;
  if found then
    delete from public.player_notifs n where n.user_id = uid
      and n.id not in (select k.id from public.player_notifs k where k.user_id = uid order by k.at desc limit 30);
  end if;
end $$;

create or replace function public.notifs_list() returns setof public.player_notifs
language sql stable security definer set search_path to '' as $$
  select * from public.player_notifs where user_id = auth.uid() order by at desc limit 30;
$$;

create or replace function public.notifs_read() returns void language sql security definer set search_path to '' as $$
  update public.player_notifs set read = true where user_id = auth.uid() and not read;
$$;

create or replace function public.notifs_clear() returns void language sql security definer set search_path to '' as $$
  delete from public.player_notifs where user_id = auth.uid();
$$;

revoke all on function public.notifs_add(text, bigint, text, text, text, text), public.notifs_list(), public.notifs_read(), public.notifs_clear() from public, anon;
grant execute on function public.notifs_add(text, bigint, text, text, text, text), public.notifs_list(), public.notifs_read(), public.notifs_clear() to authenticated;

-- Journal des sauvegardes refusées : 30 jours, nettoyé chaque nuit
select cron.schedule('save-refusals-cleanup', '17 4 * * *', $$delete from public.save_refusals where at < now() - interval '30 days'$$);
