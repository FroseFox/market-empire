-- Objectif commun : plus dur, et vraiment commun.
-- - Cibles relevées : habitants 15 % (au lieu de 5 %), bâtiments 15 par joueur actif (au lieu de 6),
--   patrimoine +100 % (au lieu de +30 %).
-- - La part d'un joueur ne compte que jusqu'à 40 % de la cible : il faut au moins trois joueurs pour l'atteindre.
-- - Récompense (versée par le jeu) : 3 fois la base des missions au lieu de 10.
create or replace function public.world_cap() returns numeric language sql immutable as $$ select 0.4::numeric $$;

create or replace function public.world_target(p_kind text, p_players integer, p_total numeric) returns numeric
language sql immutable set search_path to '' as $$
  select case p_kind
    when 'population' then greatest(p_players * 400, round(p_total * 0.15 / 10) * 10)
    when 'buildings' then p_players * 15
    else greatest(p_players * 500000, round(p_total * 1.0 / 10000) * 10000)
  end;
$$;

create or replace function public.world_goal_ensure() returns public.world_goals language plpgsql security definer set search_path to '' as $$
declare g public.world_goals; w date := public.world_week(); n integer; total numeric; k text; prev public.world_goals;
begin
  select * into g from public.world_goals where week = w;
  if found then return g; end if;
  perform pg_advisory_xact_lock(424242);
  select * into g from public.world_goals where week = w;
  if found then return g; end if;
  -- Semaine précédente : contributions (plafonnées) et progression arrêtées
  for prev in select * from public.world_goals where final is null and week < w loop
    update public.world_goal_base b set gain = greatest(0, v.value - b.value)
      from public.world_values(prev.kind) v where b.goal_id = prev.id and v.user_id = b.user_id;
    update public.world_goals set final = coalesce((select sum(least(coalesce(gain, 0), prev.target * public.world_cap())) from public.world_goal_base where goal_id = prev.id), 0) where id = prev.id;
  end loop;
  select count(*) into n from public.players p where p.updated_at > now() - interval '7 days' and not coalesce(p.tester, false);
  n := greatest(n, 3);
  k := (array['population', 'buildings', 'net_worth'])[(extract(week from w)::int % 3) + 1];
  select coalesce(sum(v.value), 0) into total from public.world_values(k) v join public.players p on p.id = v.user_id where p.updated_at > now() - interval '7 days';
  insert into public.world_goals (week, kind, target, players) values (w, k, public.world_target(k, n, total), n) returning * into g;
  insert into public.world_goal_base (goal_id, user_id, value) select g.id, v.user_id, v.value from public.world_values(k) v;
  return g;
end $$;

create or replace function public.world_goal_status() returns jsonb language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); g public.world_goals; progress numeric; mine numeric; prev public.world_goals; pmine numeric; contributors integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  g := public.world_goal_ensure();
  insert into public.world_goal_base (goal_id, user_id, value)
    select g.id, v.user_id, v.value from public.world_values(g.kind) v
    where not exists (select 1 from public.world_goal_base b where b.goal_id = g.id and b.user_id = v.user_id);
  select coalesce(sum(least(greatest(0, v.value - b.value), g.target * public.world_cap())), 0), count(*) filter (where v.value > b.value),
         coalesce(max(greatest(0, v.value - b.value)) filter (where b.user_id = me), 0)
    into progress, contributors, mine
    from public.world_goal_base b join public.world_values(g.kind) v on v.user_id = b.user_id where b.goal_id = g.id;
  if progress >= g.target and g.reached_at is null then
    update public.world_goals set reached_at = now() where id = g.id and reached_at is null;
    if found then
      perform public.push_enqueue(b.user_id, 'world', 'Objectif commun atteint', 'Votre récompense vous attend dans le jeu.', 'monde')
        from public.world_goal_base b join public.world_values(g.kind) v on v.user_id = b.user_id where b.goal_id = g.id and v.value > b.value;
    end if;
  end if;
  select * into prev from public.world_goals where week = g.week - 7 and final is not null and final >= target;
  if found then select coalesce(gain, 0) into pmine from public.world_goal_base where goal_id = prev.id and user_id = me; end if;
  return jsonb_build_object(
    'id', g.id, 'week', g.week, 'kind', g.kind, 'target', g.target, 'players', g.players, 'progress', progress,
    'contributors', contributors, 'mine', mine, 'cap', g.target * public.world_cap(), 'ends', ((g.week + 7)::timestamp at time zone 'Europe/Paris'),
    'claimed', exists (select 1 from public.world_goal_claims c where c.goal_id = g.id and c.user_id = me),
    'previous', case when prev.id is not null and coalesce(pmine, 0) > 0
      and not exists (select 1 from public.world_goal_claims c where c.goal_id = prev.id and c.user_id = me)
      then jsonb_build_object('id', prev.id, 'kind', prev.kind, 'target', prev.target, 'progress', prev.final, 'mine', pmine) end
  );
end $$;

create or replace function public.world_goal_claim(p_id bigint) returns boolean language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); g public.world_goals; progress numeric; mine numeric;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.world_goals where id = p_id;
  if not found or g.week < public.world_week() - 7 then return false; end if;
  if g.final is not null then
    progress := g.final;
    select coalesce(gain, 0) into mine from public.world_goal_base where goal_id = g.id and user_id = me;
  else
    select coalesce(sum(least(greatest(0, v.value - b.value), g.target * public.world_cap())), 0), coalesce(max(greatest(0, v.value - b.value)) filter (where b.user_id = me), 0)
      into progress, mine
      from public.world_goal_base b join public.world_values(g.kind) v on v.user_id = b.user_id where b.goal_id = g.id;
  end if;
  if progress < g.target or coalesce(mine, 0) <= 0 then return false; end if;
  insert into public.world_goal_claims (goal_id, user_id) values (g.id, me) on conflict do nothing;
  return found;
end $$;

-- Semaine en cours : même règle tout de suite (personne ne l'avait encore atteinte)
update public.world_goals g set target = public.world_target(g.kind, g.players,
  (select coalesce(sum(v.value), 0) from public.world_values(g.kind) v join public.players p on p.id = v.user_id where p.updated_at > now() - interval '7 days'))
where g.week = public.world_week() and g.reached_at is null;

revoke all on function public.world_target(text, integer, numeric) from public, anon, authenticated;
