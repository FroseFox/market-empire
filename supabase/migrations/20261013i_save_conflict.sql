-- Deux appareils (ou deux onglets) sur le même compte : une sauvegarde ne peut plus en écraser une plus récente.
-- Le jeu envoie `p_base`, la date de la sauvegarde en ligne qu'il a lue ou écrite en dernier. Si la sauvegarde en ligne
-- a changé depuis (un autre appareil a enregistré), l'écriture est refusée (« conflit ») : le jeu reprend alors l'autre partie.
-- Avant, le jeu vérifiait lui-même juste avant d'écrire, mais deux appareils pouvaient passer la vérification en même temps.
-- `p_base` est facultatif : une ancienne version du jeu encore ouverte continue d'enregistrer comme avant.
-- L'ancienne version (7 paramètres) est mise de côté sous un autre nom (deux fonctions du même nom rendraient l'appel ambigu).
alter function public.save_game(jsonb, bigint, text, bigint, integer, real, integer) rename to save_game_v1_unused;
revoke all on function public.save_game_v1_unused(jsonb, bigint, text, bigint, integer, real, integer) from public, anon, authenticated;

create or replace function public.save_game(p_data jsonb, p_saved_at bigint, p_city text, p_net_worth bigint, p_population integer,
  p_perf real, p_day integer, p_base bigint default null)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  s public.saves%rowtype;
  tester boolean;
  credit bigint;
  d_day integer := greatest(1, least(public.save_num(p_data -> 'day'), 1000000))::integer;
  d_pop integer := greatest(0, least(public.save_num(p_data -> 'population'), 100000000))::integer;
  worth bigint := greatest(public.save_worth(p_data), least(greatest(coalesce(p_net_worth, 0), 0), 1000000000000));
  fresh boolean;
  hours numeric;
  ref_hours numeric;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if pg_column_size(p_data) > 131072 then raise exception 'sauvegarde trop volumineuse'; end if;
  select * into s from public.saves where id = uid for update;
  if found and p_base is not null and s.saved_at is distinct from p_base then
    raise exception 'conflit' using hint = 'un autre appareil a enregistré entre-temps';
  end if;
  if found and s.updated_at > now() - interval '20 seconds' then
    return false;
  end if;
  select coalesce(p.tester, false), coalesce(p.share_credit, 0) into tester, credit from public.players p where p.id = uid;
  tester := coalesce(tester, false);
  credit := coalesce(credit, 0);

  fresh := d_day <= 2 and worth <= 150000 and d_pop <= 300;

  if not tester then
    if jsonb_typeof(p_data -> 'sandbox') = 'object' then
      raise exception 'refus:test' using hint = 'mode test réservé aux comptes de test';
    end if;
    if not fresh then
      if not found or s.day_ref is null or s.worth_ref_at is null then
        raise exception 'refus:depart' using hint = 'une partie en ligne commence au jour 1';
      end if;
      hours := extract(epoch from now() - s.day_ref_at) / 3600;
      if d_day > s.day_ref + floor(hours) + 2 then
        raise exception 'refus:jours' using hint = 'plus de jours de ville que d''heures écoulées';
      end if;
      ref_hours := least(extract(epoch from now() - s.worth_ref_at) / 3600, 72);
      if worth > s.worth_ref * power(1.03, ref_hours) * 2 + 150000 + greatest(0, credit - coalesce(s.credit_ref, credit)) then
        raise exception 'refus:argent' using hint = 'argent apparu trop vite';
      end if;
      if d_pop > (greatest(s.pop_ref, 250) + 50) * power(1.13, floor(ref_hours) + 2) then
        raise exception 'refus:habitants' using hint = 'habitants apparus trop vite';
      end if;
    end if;
  end if;

  insert into public.saves (id, data, saved_at, day_ref, day_ref_at, worth_ref, pop_ref, credit_ref, worth_ref_at)
    values (uid, p_data, p_saved_at, d_day, now(), worth, d_pop, credit, now())
  on conflict (id) do update set data = excluded.data, saved_at = excluded.saved_at, updated_at = now(),
    day_ref = case when fresh or tester or saves.day_ref is null then excluded.day_ref else saves.day_ref end,
    day_ref_at = case when fresh or tester or saves.day_ref is null then now() else saves.day_ref_at end,
    worth_ref = case when fresh or tester or saves.worth_ref_at is null then excluded.worth_ref
      when saves.worth_ref_at < now() - interval '24 hours' then greatest(excluded.worth_ref, saves.worth_ref / 2)
      else saves.worth_ref end,
    pop_ref = case when fresh or tester or saves.worth_ref_at is null then excluded.pop_ref
      when saves.worth_ref_at < now() - interval '24 hours' then greatest(excluded.pop_ref, saves.pop_ref / 2)
      else saves.pop_ref end,
    credit_ref = case when fresh or tester or saves.worth_ref_at is null or saves.worth_ref_at < now() - interval '24 hours'
      then excluded.credit_ref else saves.credit_ref end,
    worth_ref_at = case when fresh or tester or saves.worth_ref_at is null or saves.worth_ref_at < now() - interval '24 hours'
      then now() else saves.worth_ref_at end;

  update public.players p set
    city_name = left(coalesce(nullif(trim(p_city), ''), 'Ma ville'), 40),
    net_worth = greatest(0, least(coalesce(p_net_worth, 0), 1000000000000)),
    population = d_pop,
    perf = greatest(-1, least(coalesce(p_perf, 0), 1000)),
    day = d_day,
    updated_at = now()
  where p.id = uid;
  return true;
end $function$;

revoke all on function public.save_game(jsonb, bigint, text, bigint, integer, real, integer, bigint) from public, anon;
grant execute on function public.save_game(jsonb, bigint, text, bigint, integer, real, integer, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
