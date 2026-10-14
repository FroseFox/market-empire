-- Objectif commun de la semaine : tous les joueurs ensemble, du lundi au dimanche (heure de Paris).
-- Trois thèmes à tour de rôle : habitants gagnés, bâtiments construits, patrimoine gagné. La cible suit le nombre de
-- joueurs actifs (au moins 3) et la taille de leurs villes : atteignable à 5 ou 6 joueurs comme à 200.
-- Chaque joueur qui a fait avancer l'objectif touche la récompense (versée par le jeu, à l'échelle de sa ville) ;
-- elle se réclame une fois, pendant la semaine ou la suivante. Comptes de test exclus.
create table if not exists public.world_goals (
  id bigserial primary key,
  week date not null unique,
  kind text not null check (kind in ('population', 'buildings', 'net_worth')),
  target numeric not null,
  players integer not null,
  reached_at timestamptz,
  final numeric -- progression arrêtée à la fin de la semaine
);
create table if not exists public.world_goal_base (
  goal_id bigint not null references public.world_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value numeric not null,
  gain numeric, -- contribution arrêtée à la fin de la semaine
  primary key (goal_id, user_id)
);
create table if not exists public.world_goal_claims (
  goal_id bigint not null references public.world_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (goal_id, user_id)
);
alter table public.world_goals enable row level security;
alter table public.world_goal_base enable row level security;
alter table public.world_goal_claims enable row level security;
-- Aucune règle d'accès : on ne passe que par les fonctions ci-dessous.

-- Valeur actuelle de chaque joueur pour un thème
create or replace function public.world_values(p_kind text) returns table (user_id uuid, value numeric)
language sql stable security definer set search_path to '' as $$
  select p.id, case p_kind
    when 'population' then p.population::numeric
    when 'net_worth' then p.net_worth::numeric
    else (select coalesce(sum(e.value::numeric), 0) from public.saves s cross join lateral jsonb_each_text(coalesce(s.data -> 'buildings', '{}'::jsonb)) e where s.id = p.id)
  end
  from public.players p where not coalesce(p.tester, false);
$$;

-- Lundi de la semaine en cours, heure de Paris
create or replace function public.world_week() returns date language sql stable set search_path to '' as $$
  select date_trunc('week', now() at time zone 'Europe/Paris')::date;
$$;

-- Objectif de la semaine (créé au premier passage) ; ferme celui de la semaine d'avant
create or replace function public.world_goal_ensure() returns public.world_goals language plpgsql security definer set search_path to '' as $$
declare g public.world_goals; w date := public.world_week(); n integer; total numeric; k text; t numeric; prev public.world_goals;
begin
  select * into g from public.world_goals where week = w;
  if found then return g; end if;
  perform pg_advisory_xact_lock(424242);
  select * into g from public.world_goals where week = w;
  if found then return g; end if;
  -- Semaine précédente : contributions et progression arrêtées
  for prev in select * from public.world_goals where final is null and week < w loop
    update public.world_goal_base b set gain = greatest(0, v.value - b.value)
      from public.world_values(prev.kind) v where b.goal_id = prev.id and v.user_id = b.user_id;
    update public.world_goals set final = coalesce((select sum(coalesce(gain, 0)) from public.world_goal_base where goal_id = prev.id), 0) where id = prev.id;
  end loop;
  select count(*) into n from public.players p where p.updated_at > now() - interval '7 days' and not coalesce(p.tester, false);
  n := greatest(n, 3);
  k := (array['population', 'buildings', 'net_worth'])[(extract(week from w)::int % 3) + 1];
  select coalesce(sum(v.value), 0) into total from public.world_values(k) v join public.players p on p.id = v.user_id where p.updated_at > now() - interval '7 days';
  t := case k
    when 'population' then greatest(n * 150, round(total * 0.05 / 10) * 10)
    when 'buildings' then n * 6
    else greatest(n * 100000, round(total * 0.3 / 10000) * 10000)
  end;
  insert into public.world_goals (week, kind, target, players) values (w, k, t, n) returning * into g;
  insert into public.world_goal_base (goal_id, user_id, value) select g.id, v.user_id, v.value from public.world_values(k) v;
  return g;
end $$;

-- État pour le joueur : objectif en cours (progression, sa part, réclamé ?) et celui de la semaine d'avant s'il reste à réclamer
create or replace function public.world_goal_status() returns jsonb language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); g public.world_goals; progress numeric; mine numeric; prev public.world_goals; pmine numeric; contributors integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  g := public.world_goal_ensure();
  -- Nouveaux joueurs : leur point de départ est leur valeur d'aujourd'hui
  insert into public.world_goal_base (goal_id, user_id, value)
    select g.id, v.user_id, v.value from public.world_values(g.kind) v
    where not exists (select 1 from public.world_goal_base b where b.goal_id = g.id and b.user_id = v.user_id);
  select coalesce(sum(greatest(0, v.value - b.value)), 0), count(*) filter (where v.value > b.value),
         coalesce(max(greatest(0, v.value - b.value)) filter (where b.user_id = me), 0)
    into progress, contributors, mine
    from public.world_goal_base b join public.world_values(g.kind) v on v.user_id = b.user_id where b.goal_id = g.id;
  if progress >= g.target and g.reached_at is null then
    update public.world_goals set reached_at = now() where id = g.id and reached_at is null;
    if found then
      -- Prévient chaque participant (notification de l'appareil, s'il les a activées)
      perform public.push_enqueue(b.user_id, 'world', 'Objectif commun atteint', 'Votre récompense vous attend dans le jeu.', 'monde')
        from public.world_goal_base b join public.world_values(g.kind) v on v.user_id = b.user_id where b.goal_id = g.id and v.value > b.value;
    end if;
  end if;
  select * into prev from public.world_goals where week = g.week - 7 and final is not null and final >= target;
  if found then select coalesce(gain, 0) into pmine from public.world_goal_base where goal_id = prev.id and user_id = me; end if;
  return jsonb_build_object(
    'id', g.id, 'week', g.week, 'kind', g.kind, 'target', g.target, 'players', g.players, 'progress', progress,
    'contributors', contributors, 'mine', mine, 'ends', ((g.week + 7)::timestamp at time zone 'Europe/Paris'),
    'claimed', exists (select 1 from public.world_goal_claims c where c.goal_id = g.id and c.user_id = me),
    'previous', case when prev.id is not null and coalesce(pmine, 0) > 0
      and not exists (select 1 from public.world_goal_claims c where c.goal_id = prev.id and c.user_id = me)
      then jsonb_build_object('id', prev.id, 'kind', prev.kind, 'target', prev.target, 'progress', prev.final, 'mine', pmine) end
  );
end $$;

-- Réclame la récompense : objectif atteint, joueur qui y a contribué, une seule fois. `true` = le jeu verse la récompense.
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
    select coalesce(sum(greatest(0, v.value - b.value)), 0), coalesce(max(greatest(0, v.value - b.value)) filter (where b.user_id = me), 0)
      into progress, mine
      from public.world_goal_base b join public.world_values(g.kind) v on v.user_id = b.user_id where b.goal_id = g.id;
  end if;
  if progress < g.target or coalesce(mine, 0) <= 0 then return false; end if;
  insert into public.world_goal_claims (goal_id, user_id) values (g.id, me) on conflict do nothing;
  return found;
end $$;

revoke all on function public.world_values(text) from public, anon, authenticated;
revoke all on function public.world_goal_ensure() from public, anon, authenticated;
revoke all on function public.world_goal_status() from public, anon;
revoke all on function public.world_goal_claim(bigint) from public, anon;
grant execute on function public.world_goal_status() to authenticated;
grant execute on function public.world_goal_claim(bigint) to authenticated;
