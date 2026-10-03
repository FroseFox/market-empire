-- Market Empire — garde-fou du classement.
-- La partie est calculée dans le navigateur : le serveur ne peut pas (encore) rejouer chaque action.
-- En attendant un serveur qui fait autorité, on repère les sauvegardes impossibles et on les retire du classement.
-- Additif : trois colonnes, un déclencheur, une vue. La sauvegarde elle-même n'est jamais refusée.

alter table public.players
  add column if not exists flagged boolean not null default false,   -- retiré du classement
  add column if not exists flag_reason text,
  add column if not exists nw_ref bigint,                            -- patrimoine de référence (au plus 1 point par 24 h)
  add column if not exists nw_ref_at timestamptz;

create or replace function public.players_guard()
returns trigger language plpgsql as $$
declare
  hours numeric;      -- temps réel écoulé depuis la dernière sauvegarde
  ref_hours numeric;  -- temps réel écoulé depuis le point de référence
  reason text := null;
begin
  -- Nouvelle partie (recommencer) : on repart de zéro, y compris pour le signalement
  if new.day <= 2 and new.population <= 300 and new.net_worth <= 110000 then
    new.flagged := false; new.flag_reason := null;
    new.nw_ref := 100000; new.nw_ref_at := now();
    return new;
  end if;

  hours := greatest(0, extract(epoch from (now() - old.updated_at)) / 3600.0);
  -- Premier passage : la référence est la sauvegarde précédente, à sa date
  if new.nw_ref is null then new.nw_ref := greatest(old.net_worth, 100000); new.nw_ref_at := old.updated_at; end if;
  ref_hours := greatest(0, extract(epoch from (now() - new.nw_ref_at)) / 3600.0);

  -- 1 jour de ville par heure réelle, jamais plus (marge de 2 jours)
  if new.day > old.day + floor(hours) + 2 then
    reason := 'jours de ville en avance sur le temps réel';
  -- La population gagne au plus 12 % par jour de ville
  elsif new.population > (greatest(old.population, 250) + 50) * power(1.13, least(floor(hours) + 2, 200)) then
    reason := 'population impossible';
  -- Patrimoine : au plus 3 % par heure (ville) × 2 (bourse) + 150 000 € (subventions) depuis le point de référence
  elsif new.net_worth > new.nw_ref::numeric * power(1.03, least(ref_hours, 400)) * 2 + 150000 then
    reason := 'patrimoine impossible';
  elsif new.perf < -1 or new.perf > 100 or new.population > 30000000 or new.net_worth > 10000000000000 then
    reason := 'valeurs hors limites';
  end if;

  if reason is not null then
    new.flagged := true; new.flag_reason := reason;
  elsif ref_hours >= 24 then
    -- Sauvegarde plausible : le point de référence avance, au plus une fois par 24 h
    new.nw_ref := greatest(new.net_worth, 100000); new.nw_ref_at := now();
  end if;
  return new;
exception when others then
  return new; -- le garde-fou ne doit jamais empêcher une sauvegarde
end $$;

drop trigger if exists players_guard on public.players;
create trigger players_guard before update of net_worth, population, perf, day on public.players
  for each row execute function public.players_guard();

-- Classement public : sans les joueurs signalés, et sans le plan de ville (lu seulement lors d'une visite)
create or replace view public.ranking as
  select id, name, avatar, country, city_name, net_worth, population, perf, day, updated_at
  from public.players where not flagged;
grant select on public.ranking to anon, authenticated;

-- Pour lever un signalement à la main :
--   update public.players set flagged = false, flag_reason = null, nw_ref = net_worth, nw_ref_at = now() where id = '…';
