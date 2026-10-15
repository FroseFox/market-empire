-- Journaux pour comprendre les problèmes des joueurs (lisibles seulement depuis le tableau de bord Supabase).
-- 1. save_refusals : chaque sauvegarde refusée par l'anti-triche (raison, chiffres envoyés, références du serveur).
--    Un refus annule tout ce que save_game a écrit : c'est le jeu qui le signale juste après (save_refused),
--    et le serveur y joint lui-même ses propres références. Au plus une ligne par minute et 50 par jour et par joueur.
-- 2. flag_log : chaque signalement du classement (posé et levé), écrit par le déclencheur players_guard.
-- 3. Récompenses : l'argent versé par le registre (objectif commun…) s'ajoute à la marge de save_game, pour qu'une
--    grosse récompense encaissée juste après une sauvegarde ne fasse jamais refuser la suivante.

create table if not exists public.save_refusals (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  day integer, worth bigint, population integer,
  ref_day integer, ref_worth bigint, ref_pop integer, ref_hours numeric,
  version text,
  at timestamptz not null default now()
);
create index if not exists save_refusals_user_idx on public.save_refusals (user_id, at);
alter table public.save_refusals enable row level security;

create or replace function public.save_refused(p_reason text, p_day integer, p_worth bigint, p_population integer, p_version text)
returns void language plpgsql security definer set search_path to '' as $$
declare uid uuid := auth.uid(); s public.saves%rowtype;
begin
  if uid is null then return; end if;
  if exists (select 1 from public.save_refusals where user_id = uid and at > now() - interval '1 minute') then return; end if;
  if (select count(*) from public.save_refusals where user_id = uid and at > now() - interval '1 day') >= 50 then return; end if;
  select * into s from public.saves where id = uid;
  insert into public.save_refusals (user_id, reason, day, worth, population, ref_day, ref_worth, ref_pop, ref_hours, version)
  values (uid, left(coalesce(p_reason, '?'), 40), p_day, p_worth, p_population, s.day_ref, s.worth_ref, s.pop_ref,
    round((extract(epoch from now() - s.worth_ref_at) / 3600)::numeric, 2), left(p_version, 20));
end $$;
revoke all on function public.save_refused(text, integer, bigint, integer, text) from public, anon;
grant execute on function public.save_refused(text, integer, bigint, integer, text) to authenticated;

create table if not exists public.flag_log (
  id bigserial primary key,
  user_id uuid not null references public.players (id) on delete cascade,
  reason text not null,
  day integer, net_worth bigint, population integer,
  at timestamptz not null default now(),
  cleared_at timestamptz
);
create index if not exists flag_log_user_idx on public.flag_log (user_id, at);
alter table public.flag_log enable row level security;

create or replace function public.flag_note(p_user uuid, p_reason text, p_day integer, p_worth bigint, p_pop integer)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if p_reason is null then
    update public.flag_log set cleared_at = now() where user_id = p_user and cleared_at is null;
  else
    update public.flag_log set cleared_at = now() where user_id = p_user and cleared_at is null and reason <> p_reason;
    if not exists (select 1 from public.flag_log where user_id = p_user and cleared_at is null) then
      insert into public.flag_log (user_id, reason, day, net_worth, population) values (p_user, p_reason, p_day, p_worth, p_pop);
    end if;
  end if;
end $$;
revoke all on function public.flag_note(uuid, text, integer, bigint, integer) from public, anon, authenticated;

-- Le déclencheur note chaque changement de signalement (le reste est inchangé)
create or replace function public.players_guard() returns trigger language plpgsql set search_path to '' as $function$
declare
  hours numeric;
  ref_hours numeric;
  reason text := null;
begin
  if new.tester then
    new.flagged := false; new.flag_reason := null;
  elsif new.day <= 2 and new.population <= 300 and new.net_worth <= 110000 then
    new.flagged := false; new.flag_reason := null;
    new.nw_ref := 100000; new.nw_ref_at := now();
  else
    hours := greatest(0, extract(epoch from (now() - old.updated_at)) / 3600.0);
    if new.nw_ref is null then new.nw_ref := greatest(old.net_worth, 100000); new.nw_ref_at := old.updated_at; end if;
    ref_hours := greatest(0, extract(epoch from (now() - new.nw_ref_at)) / 3600.0);

    if new.population > (greatest(old.population, 250) + 50) * power(1.13, least(greatest(floor(hours), new.day - old.day) + 2, 200)) then
      reason := 'population impossible';
    elsif new.net_worth > new.nw_ref::numeric * power(1.03, least(ref_hours, 400)) * 2 + 150000 then
      reason := 'patrimoine impossible';
    elsif new.perf < -1 or new.perf > 100 or new.population > 30000000 or new.net_worth > 10000000000000 then
      reason := 'valeurs hors limites';
    end if;

    if reason is not null then
      new.flagged := true; new.flag_reason := reason;
    else
      new.flagged := false; new.flag_reason := null;
      if ref_hours >= 24 then new.nw_ref := greatest(new.net_worth, 100000); new.nw_ref_at := now(); end if;
    end if;
  end if;
  if new.flag_reason is distinct from old.flag_reason then
    begin
      perform public.flag_note(new.id, new.flag_reason, new.day, new.net_worth, new.population);
    exception when others then null;
    end;
  end if;
  return new;
exception when others then
  return new;
end $function$;

-- Argent versé par le registre depuis une date (récompenses, remboursements) : ajouté à la marge de save_game
create or replace function public.ledger_gain(p_user uuid, p_since timestamptz) returns bigint
language sql stable security definer set search_path to '' as $$
  select coalesce(sum(amount), 0)::bigint from public.player_ledger where user_id = p_user and amount > 0 and at >= coalesce(p_since, now());
$$;
revoke all on function public.ledger_gain(uuid, timestamptz) from public, anon, authenticated;

do $$
declare d text; o text := 'greatest(0, credit - coalesce(s.credit_ref, credit))';
begin
  d := pg_get_functiondef('public.save_game(jsonb,bigint,text,bigint,integer,real,integer,bigint)'::regprocedure);
  if position('ledger_gain' in d) = 0 then
    if position(o in d) = 0 then raise exception 'save_game : marge introuvable'; end if;
    d := replace(d, o, o || ' + public.ledger_gain(uid, s.worth_ref_at)');
    execute d;
  end if;
end $$;
