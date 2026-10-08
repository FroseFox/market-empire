-- Market Empire — durcissement des droits (signalé par les conseils de sécurité Supabase).
-- Aucune donnée n'est modifiée ; le site lit exactement les mêmes choses qu'avant.

-- 1) Les vues « ranking » et « market » étaient modifiables par n'importe qui : une vue simple est modifiable
--    par défaut, et elle agit avec les droits de son propriétaire. Avec la clé publique du site, on pouvait donc
--    changer ou supprimer des lignes de « players » en passant par « ranking ». Elles deviennent en lecture seule.
revoke all on public.ranking, public.market from anon, authenticated;
grant select on public.ranking, public.market to anon, authenticated;

-- « ranking » ne montre que des colonnes déjà publiques : elle peut suivre les droits de celui qui la lit.
-- « market » garde les droits de son propriétaire : elle doit additionner les contrats de TOUS les joueurs pour
-- calculer le surplus encore disponible, alors que chacun ne peut lire que ses propres contrats.
alter view public.ranking set (security_invoker = true);

-- 2) Tables de marché : lecture seule pour le site (TRUNCATE, TRIGGER et REFERENCES n'avaient rien à y faire).
revoke truncate, trigger, references on public.assets, public.asset_prices, public.market_series from anon, authenticated;

-- 3) Garde-fou du classement : chemin de recherche figé (il n'utilise que des fonctions intégrées).
alter function public.players_guard() set search_path = '';

-- 4) Contrats : l'identité du joueur est lue une seule fois par requête, pas une fois par ligne.
drop policy if exists contracts_own on public.contracts;
create policy contracts_own on public.contracts for select to authenticated
  using ((select auth.uid()) = seller or (select auth.uid()) = buyer);
