-- Chat du jeu : un salon pour tous les joueurs (« global ») et un salon privé par alliance (son identifiant).
-- Chaque message s'efface 24 h après son envoi. Le jeu relit le salon ouvert toutes les quelques secondes
-- (seulement les nouveaux messages) : pas de connexion permanente, rien à payer en plus sur le plan gratuit.
--
-- Garde-fous : 300 caractères, un message toutes les 3 s, gros mots masqués, signalement (3 signalements = message
-- masqué), modérateurs (players.moderator) qui masquent un message ou excluent un joueur du chat pour un temps.
-- Devenir modérateur :  update public.players set moderator = true where name = 'Pseudo';

alter table public.players add column if not exists moderator boolean not null default false;

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room text not null check (room = 'global' or room ~ '^[0-9a-f-]{36}$'),
  author uuid not null references public.players(id) on delete cascade,
  name text not null,
  body text not null check (char_length(body) between 1 and 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room, id);
create index if not exists chat_messages_author_idx on public.chat_messages (author, created_at desc);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at);

create table if not exists public.chat_reports (
  message bigint not null references public.chat_messages(id) on delete cascade,
  reporter uuid not null references public.players(id) on delete cascade,
  primary key (message, reporter)
);
create index if not exists chat_reports_reporter_idx on public.chat_reports (reporter);

create table if not exists public.chat_bans (
  player uuid primary key references public.players(id) on delete cascade,
  until timestamptz not null,
  reason text
);

alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_bans enable row level security;

-- Lecture : le salon global, et celui de son alliance. Les messages masqués et de plus de 24 h ne sont plus servis.
drop policy if exists "salons du joueur" on public.chat_messages;
create policy "salons du joueur" on public.chat_messages for select to authenticated using (
  not hidden and created_at > now() - interval '24 hours'
  and (room = 'global' or room = (select p.alliance::text from public.players p where p.id = (select auth.uid())))
);
grant select on public.chat_messages to authenticated;

-- Insultes et injures courantes (mot entier, sans tenir compte des majuscules) : remplacés par des étoiles.
create or replace function public.chat_clean(t text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(t,
    '\m(connard|connards|connasse|conasse|encul[ée]e?s?|enculer|salope|salopes|pute|putes|ntm|fdp|batard|bâtard|pd|tapette|niquer|nique ta|nègre|negre|bougnoule|youpin|chienne|fuck|fucking|bitch|nigga|nigger|cunt|whore)\M',
    '***', 'gi')
$$;

create or replace function public.send_chat(p_room text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pl record;
  clean text := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]', ' ', 'g'));
  msg public.chat_messages;
begin
  if me is null then return jsonb_build_object('error', 'connexion'); end if;
  select p.name, p.city_name, p.alliance into pl from public.players p where p.id = me;
  if not found then return jsonb_build_object('error', 'connexion'); end if;
  if p_room <> 'global' and (pl.alliance is null or p_room <> pl.alliance::text) then return jsonb_build_object('error', 'salon'); end if;
  if exists (select 1 from public.chat_bans b where b.player = me and b.until > now()) then return jsonb_build_object('error', 'exclu'); end if;
  if clean = '' then return jsonb_build_object('error', 'vide'); end if;
  if char_length(clean) > 300 then return jsonb_build_object('error', 'long'); end if;
  if exists (select 1 from public.chat_messages m where m.author = me and m.created_at > now() - interval '3 seconds') then
    return jsonb_build_object('error', 'vite');
  end if;
  insert into public.chat_messages (room, author, name, body)
    values (p_room, me, left(coalesce(nullif(pl.name, ''), nullif(pl.city_name, ''), 'Joueur'), 24), public.chat_clean(clean))
    returning * into msg;
  return jsonb_build_object('id', msg.id, 'name', msg.name, 'body', msg.body, 'at', msg.created_at);
end $$;

-- Signaler un message : au 3e signalement de joueurs différents, il est masqué pour tous.
create or replace function public.report_chat(p_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return false; end if;
  if not exists (select 1 from public.chat_messages m where m.id = p_id and m.author <> me) then return false; end if;
  insert into public.chat_reports (message, reporter) values (p_id, me) on conflict do nothing;
  if (select count(*) from public.chat_reports r where r.message = p_id) >= 3 then
    update public.chat_messages set hidden = true where id = p_id;
  end if;
  return true;
end $$;

-- Modération : masquer un message, et (si p_hours > 0) exclure son auteur du chat pendant ce nombre d'heures.
create or replace function public.moderate_chat(p_id bigint, p_hours integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare who uuid;
begin
  if not coalesce((select p.moderator from public.players p where p.id = auth.uid()), false) then return false; end if;
  update public.chat_messages set hidden = true where id = p_id returning author into who;
  if who is null then return false; end if;
  if coalesce(p_hours, 0) > 0 then
    insert into public.chat_bans (player, until, reason) values (who, now() + make_interval(hours => least(p_hours, 24 * 365)), 'modération')
      on conflict (player) do update set until = excluded.until, reason = excluded.reason;
  end if;
  return true;
end $$;

revoke all on function public.chat_clean(text) from public, anon, authenticated;
revoke all on function public.send_chat(text, text) from public, anon;
revoke all on function public.report_chat(bigint) from public, anon;
revoke all on function public.moderate_chat(bigint, integer) from public, anon;
grant execute on function public.send_chat(text, text) to authenticated;
grant execute on function public.report_chat(bigint) to authenticated;
grant execute on function public.moderate_chat(bigint, integer) to authenticated;

-- Effacement glissant : toutes les 10 minutes, les messages de plus de 24 h (et leurs signalements) disparaissent.
select cron.unschedule('chat-cleanup') where exists (select 1 from cron.job where jobname = 'chat-cleanup');
select cron.schedule('chat-cleanup', '*/10 * * * *', $cron$
  delete from public.chat_messages where created_at < now() - interval '24 hours';
  delete from public.chat_bans where until < now();
$cron$);
