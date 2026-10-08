-- Notifications quand le joueur n'est pas sur le jeu (Web Push).
-- - push_config : la paire de clés du serveur, créée par la fonction « send-push » à son premier passage ;
-- - push_subs   : les appareils abonnés de chaque joueur (5 au plus) ;
-- - push_queue  : les messages à envoyer (tout de suite, ou à une date pour les rappels).
-- Aucune de ces tables n'est lisible par les joueurs : tout passe par les fonctions ci-dessous.

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);
create table if not exists public.push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text not null default '',
  send_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
-- Un seul rappel en attente par joueur et par type : le suivant le remplace
create unique index if not exists push_queue_reminder_idx on public.push_queue (user_id, kind) where sent_at is null and kind = 'city_full';
create index if not exists push_queue_due_idx on public.push_queue (send_at) where sent_at is null;

alter table public.push_config enable row level security;
alter table public.push_subs enable row level security;
alter table public.push_queue enable row level security;
revoke all on public.push_config, public.push_subs, public.push_queue from anon, authenticated;

-- Services de notifications reconnus (Chrome/Android, Firefox, Edge/Windows, Safari/iOS) : le serveur n'écrit nulle part ailleurs
create or replace function public.push_endpoint_ok(p text) returns boolean language sql immutable set search_path to '' as $$
  select p is not null and length(p) between 20 and 700
    and p ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/'
$$;

create or replace function public.push_public_key() returns text language sql stable security definer set search_path to '' as $$
  select c.public_key from public.push_config c where c.id = 1
$$;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.push_endpoint_ok(p_endpoint) or length(coalesce(p_p256dh, '')) not between 80 and 100 or length(coalesce(p_auth, '')) not between 16 and 40 then return false; end if;
  insert into public.push_subs as s (user_id, endpoint, p256dh, auth) values (me, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- 5 appareils au plus : les plus anciens sont retirés
  delete from public.push_subs s where s.user_id = me and s.id not in (select k.id from public.push_subs k where k.user_id = me order by k.created_at desc limit 5);
  return true;
end $$;

create or replace function public.push_unsubscribe(p_endpoint text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.push_subs s where s.endpoint = p_endpoint and s.user_id = me;
  if not exists (select 1 from public.push_subs s where s.user_id = me) then
    delete from public.push_queue q where q.user_id = me and q.sent_at is null;
  end if;
  return true;
end $$;

-- Rappel programmé par le joueur pour lui-même (« votre ville sera pleine à telle heure »). p_at vide = annuler.
create or replace function public.push_remind(p_kind text, p_at timestamptz, p_title text, p_body text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_kind is distinct from 'city_full' then return false; end if;
  if p_at is null then
    delete from public.push_queue q where q.user_id = me and q.kind = p_kind and q.sent_at is null;
    return true;
  end if;
  if not exists (select 1 from public.push_subs s where s.user_id = me) then return false; end if;
  if length(btrim(coalesce(p_title, ''))) < 2 or length(btrim(coalesce(p_body, ''))) < 2 then return false; end if;
  insert into public.push_queue as q (user_id, kind, title, body, url, send_at)
    values (me, p_kind, left(btrim(p_title), 80), left(btrim(p_body), 200), 'ville', greatest(now() + interval '5 minutes', least(p_at, now() + interval '14 days')))
    on conflict (user_id, kind) where sent_at is null and kind = 'city_full'
    do update set title = excluded.title, body = excluded.body, send_at = excluded.send_at;
  return true;
end $$;

-- Mise en file d'un message (usage interne : déclencheurs). Sans effet si le joueur n'a aucun appareil abonné.
create or replace function public.push_enqueue(p_user uuid, p_kind text, p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if p_user is null or not exists (select 1 from public.push_subs s where s.user_id = p_user) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, url) values (p_user, p_kind, left(p_title, 80), left(p_body, 200), coalesce(p_url, ''));
exception when others then null; -- une notification ne doit jamais faire échouer une action du jeu
end $$;

revoke all on function public.push_public_key(), public.push_subscribe(text, text, text), public.push_unsubscribe(text), public.push_remind(text, timestamptz, text, text), public.push_enqueue(uuid, text, text, text, text), public.push_endpoint_ok(text) from public, anon, authenticated;
grant execute on function public.push_public_key(), public.push_subscribe(text, text, text), public.push_unsubscribe(text), public.push_remind(text, timestamptz, text, text) to authenticated;

-- ─── Événements entre joueurs ───
create or replace function public.push_on_contract() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_city text;
begin
  select p.city_name into v_city from public.players p where p.id = new.buyer;
  perform public.push_enqueue(new.seller, 'contract', 'Contrat signé',
    format('%s vous achète %s %s par jour.', coalesce(v_city, 'Une ville'), new.qty, case new.resource when 'energy' then 'd''énergie' else 'de nourriture' end), 'monde');
  return new;
end $$;
drop trigger if exists push_on_contract on public.contracts;
create trigger push_on_contract after insert on public.contracts for each row execute function public.push_on_contract();

create or replace function public.push_on_shares() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_city text;
begin
  if tg_op = 'UPDATE' and new.qty <= old.qty then return new; end if;
  select p.city_name into v_city from public.players p where p.id = new.holder;
  perform public.push_enqueue(new.city, 'shares', 'Des parts de votre ville ont été achetées',
    format('%s détient maintenant %s part%s de votre ville.', coalesce(v_city, 'Une ville'), new.qty, case when new.qty > 1 then 's' else '' end), 'monde');
  return new;
end $$;
drop trigger if exists push_on_shares on public.city_shares;
create trigger push_on_shares after insert or update of qty on public.city_shares for each row execute function public.push_on_shares();

create or replace function public.push_on_blockade() returns trigger language plpgsql security definer set search_path to '' as $$
declare m record;
begin
  if new.blockade_target is null or (new.blockade_target is not distinct from old.blockade_target and new.blockade_until is not distinct from old.blockade_until) then return new; end if;
  for m in select p.id from public.players p where p.alliance = new.blockade_target loop
    perform public.push_enqueue(m.id, 'blockade', 'Blocus contre votre alliance', format('L''alliance [%s] bloque vos exportations pendant 3 jours.', new.tag), 'monde');
  end loop;
  return new;
end $$;
drop trigger if exists push_on_blockade on public.alliances;
create trigger push_on_blockade after update of blockade_target, blockade_until on public.alliances for each row execute function public.push_on_blockade();

-- ─── Envoi : chaque minute, seulement s'il y a quelque chose à envoyer ───
-- (la clé « anon » est la clé publique déjà présente dans le site : la fonction n'accepte aucun paramètre)
select cron.unschedule('send-push') where exists (select 1 from cron.job where jobname = 'send-push');
select cron.schedule('send-push', '* * * * *', $cron$
  select net.http_post(url := 'https://elpkixotuarcymalehjs.supabase.co/functions/v1/send-push', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <clé publique « anon » du projet>'), body := '{}'::jsonb)
  where exists (select 1 from public.push_queue q where q.sent_at is null and q.send_at <= now());
$cron$);
select cron.unschedule('push-cleanup') where exists (select 1 from cron.job where jobname = 'push-cleanup');
select cron.schedule('push-cleanup', '17 4 * * *', $cron$ delete from public.push_queue where sent_at < now() - interval '3 days' $cron$);
