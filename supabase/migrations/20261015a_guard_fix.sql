-- Garde-fou du classement : deux défauts corrigés.
-- 1. « Jours de ville en avance » comparait le jour à celui de la DERNIÈRE ligne enregistrée. Un appareil resté en
--    retard (téléphone en veille) enregistre un jour plus ancien ; la sauvegarde suivante, normale, semblait alors sauter
--    des jours → joueur signalé à tort, donc caché du classement chez les autres. Ce contrôle est retiré d'ici : save_game
--    le fait déjà, sur une référence fiable (day_ref, day_ref_at), et refuse la sauvegarde si c'est impossible.
-- 2. Un joueur signalé l'était pour toujours. Désormais, une sauvegarde plausible lève le signalement.
create or replace function public.players_guard() returns trigger language plpgsql set search_path to '' as $$
declare
  hours numeric;      -- temps réel écoulé depuis la dernière sauvegarde
  ref_hours numeric;  -- temps réel écoulé depuis le point de référence
  reason text := null;
begin
  -- Compte de test : aucun contrôle (il est hors classement)
  if new.tester then
    new.flagged := false; new.flag_reason := null;
    return new;
  end if;
  -- Nouvelle partie (recommencer) : on repart de zéro, y compris pour le signalement
  if new.day <= 2 and new.population <= 300 and new.net_worth <= 110000 then
    new.flagged := false; new.flag_reason := null;
    new.nw_ref := 100000; new.nw_ref_at := now();
    return new;
  end if;

  hours := greatest(0, extract(epoch from (now() - old.updated_at)) / 3600.0);
  if new.nw_ref is null then new.nw_ref := greatest(old.net_worth, 100000); new.nw_ref_at := old.updated_at; end if;
  ref_hours := greatest(0, extract(epoch from (now() - new.nw_ref_at)) / 3600.0);

  -- La population gagne au plus 12 % par jour de ville. Jours écoulés : les heures réelles, ou les jours de ville
  -- enregistrés si un appareil en retard a enregistré juste avant (save_game a déjà vérifié qu'ils étaient possibles)
  if new.population > (greatest(old.population, 250) + 50) * power(1.13, least(greatest(floor(hours), new.day - old.day) + 2, 200)) then
    reason := 'population impossible';
  -- Patrimoine : au plus 3 % par heure (ville) × 2 (bourse) + 150 000 € (subventions) depuis le point de référence
  elsif new.net_worth > new.nw_ref::numeric * power(1.03, least(ref_hours, 400)) * 2 + 150000 then
    reason := 'patrimoine impossible';
  elsif new.perf < -1 or new.perf > 100 or new.population > 30000000 or new.net_worth > 10000000000000 then
    reason := 'valeurs hors limites';
  end if;

  if reason is not null then
    new.flagged := true; new.flag_reason := reason;
  else
    -- Sauvegarde plausible : plus de signalement
    new.flagged := false; new.flag_reason := null;
    -- Le point de référence avance, au plus une fois par 24 h
    if ref_hours >= 24 then new.nw_ref := greatest(new.net_worth, 100000); new.nw_ref_at := now(); end if;
  end if;
  return new;
exception when others then
  return new; -- le garde-fou ne doit jamais empêcher une sauvegarde
end $$;

-- Joueurs signalés à tort par l'ancienne règle des jours
update public.players set flagged = false, flag_reason = null where flag_reason = 'jours de ville en avance sur le temps réel';
