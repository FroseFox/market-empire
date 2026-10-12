-- Anti-triche : le serveur vérifie chaque sauvegarde avant de l'accepter.
-- Le calcul de la partie reste sur l'appareil (aucun coût serveur en plus) ; le serveur compare seulement la sauvegarde
-- reçue à des repères qu'il tient lui-même, à son heure à lui :
--   - jours : pas plus de jours de ville que d'heures réelles écoulées depuis le début de la partie (+2 de marge) ;
--     changer l'heure du téléphone ne sert donc à rien ;
--   - argent : sa valeur, recalculée ici depuis la sauvegarde (liquidités + placements au cours du serveur − dettes),
--     et la valeur annoncée pour le classement ne peuvent pas plus que doubler en un jour (+150 000 € de marge),
--     les mêmes seuils que le signalement de players_guard, qu'aucun joueur honnête n'a jamais atteints ;
--     ce que d'autres joueurs ont versé entre-temps (rachat de parts de la ville) s'ajoute à la marge ;
--   - habitants : même croissance maximale que players_guard (13 % par heure) ;
--   - mode test (argent illimité) : réservé aux comptes de test.
-- Une sauvegarde refusée ne remplace rien : le jeu reprend la dernière partie acceptée.
-- Les comptes de test ne sont pas vérifiés. Coût : quelques octets par joueur.

alter table public.saves
  add column if not exists day_ref integer,          -- jour de ville au début du repère
  add column if not exists day_ref_at timestamptz,   -- … et quand (le repère des jours ne bouge qu'à une nouvelle partie)
  add column if not exists worth_ref bigint,         -- valeur de la partie au dernier repère d'argent
  add column if not exists pop_ref integer,          -- habitants au dernier repère
  add column if not exists credit_ref bigint,        -- argent déjà versé par la Bourse des villes à ce repère
  add column if not exists worth_ref_at timestamptz; -- repère d'argent et d'habitants, avancé une fois par jour

-- Heure du serveur, en millisecondes : le jeu compte ses jours avec elle, pas avec l'horloge de l'appareil.
create or replace function public.server_now()
returns bigint language sql stable set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;
grant execute on function public.server_now() to anon, authenticated;

-- Nombre lu dans la sauvegarde, 0 s'il n'y est pas ou n'en est pas un.
create or replace function public.save_num(v jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end
$$;

-- Valeur de la partie d'après la sauvegarde elle-même : liquidités + placements au cours connu du serveur
-- (à défaut, au prix payé) − ce qui est emprunté dessus. Les bâtiments n'y sont pas : ils s'achètent avec ces liquidités.
create or replace function public.save_worth(d jsonb)
returns bigint language sql stable set search_path = '' as $$
  select least(1e15, greatest(0, public.save_num(d -> 'cash') + coalesce((
    select sum(greatest(0, public.save_num(h.value -> 'qty') * coalesce(a.price, public.save_num(h.value -> 'avgCost'))
                           - public.save_num(h.value -> 'debt')))
    from jsonb_each(case when jsonb_typeof(d -> 'holdings') = 'object' then d -> 'holdings' else '{}'::jsonb end) h
    left join public.asset_prices a on a.symbol = h.key
  ), 0)))::bigint
$$;

create or replace function public.save_game(p_data jsonb, p_saved_at bigint, p_city text, p_net_worth bigint, p_population integer, p_perf real, p_day integer)
returns boolean language plpgsql security definer set search_path = '' as $$
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
  if found and s.updated_at > now() - interval '20 seconds' then
    return false; -- une écriture toutes les 20 s au plus
  end if;
  select coalesce(p.tester, false), coalesce(p.share_credit, 0) into tester, credit from public.players p where p.id = uid;
  tester := coalesce(tester, false);
  credit := coalesce(credit, 0);

  -- Nouvelle partie (premier compte ou « Recommencer ») : les repères repartent d'ici
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
    -- Repère des jours : fixé au début de la partie, il ne bouge plus (un compte de test suit sa partie)
    day_ref = case when fresh or tester or saves.day_ref is null then excluded.day_ref else saves.day_ref end,
    day_ref_at = case when fresh or tester or saves.day_ref is null then now() else saves.day_ref_at end,
    -- Repère d'argent et d'habitants : avancé une fois par jour ; après une chute, il ne descend que de moitié
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

  -- Classement : jour et habitants lus dans la sauvegarde vérifiée, pas dans les chiffres annoncés à côté
  update public.players p set
    city_name = left(coalesce(nullif(trim(p_city), ''), 'Ma ville'), 40),
    net_worth = greatest(0, least(coalesce(p_net_worth, 0), 1000000000000)),
    population = d_pop,
    perf = greatest(-1, least(coalesce(p_perf, 0), 1000)),
    day = d_day,
    updated_at = now()
  where p.id = uid;
  return true;
end $$;

-- Partie reprise après « Recommencer » : les repères repartent de la partie reprise (déjà vérifiée quand elle a été
-- enregistrée), sinon sa sauvegarde suivante serait jugée depuis le jour 1.
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
    backup = null, backup_at = null, backup_meta = null,
    day_ref = greatest(1, least(public.save_num(b -> 'day'), 1000000))::integer, day_ref_at = now(),
    worth_ref = greatest(public.save_worth(b), coalesce((m ->> 'net_worth')::bigint, 0)),
    pop_ref = greatest(0, least(public.save_num(b -> 'population'), 100000000))::integer, worth_ref_at = now(),
    credit_ref = (select coalesce(p.share_credit, 0) from public.players p where p.id = uid)
  where s.id = uid;
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
    update public.players p set flagged = coalesce((m ->> 'flagged')::boolean, false), flag_reason = m ->> 'flag_reason' where p.id = uid;
  end if;
  return true;
end $$;

-- Parties existantes : les repères partent de leur dernière sauvegarde (jour compté depuis sa date d'enregistrement)
update public.saves s set
  day_ref = greatest(1, least(public.save_num(s.data -> 'day'), 1000000))::integer,
  day_ref_at = s.updated_at,
  worth_ref = greatest(public.save_worth(s.data), coalesce(p.net_worth, 0)),
  pop_ref = greatest(0, least(public.save_num(s.data -> 'population'), 100000000))::integer,
  credit_ref = coalesce(p.share_credit, 0),
  worth_ref_at = now()
from public.players p
where p.id = s.id and s.day_ref is null;

revoke execute on function public.save_num(jsonb) from public, anon, authenticated;
revoke execute on function public.save_worth(jsonb) from public, anon, authenticated;
