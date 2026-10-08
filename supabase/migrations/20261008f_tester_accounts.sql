-- Market Empire — comptes de test. Appliqué sur le projet Market Empire le 8 octobre 2026.
-- Un compte de test est désigné à la main dans la base (jamais par le site) :
--   update public.players set tester = true where id = '…';
-- Il peut activer le « mode test » du jeu (argent et capital sans limite, tout débloqué).
-- Il n'est jamais signalé par le garde-fou du classement, et le site le sort du classement.
alter table public.players add column if not exists tester boolean not null default false;

-- Dans la fonction players_guard (migrations/20261003b_ranking_guard.sql), ce bloc est ajouté en tout début :
--   if new.tester then
--     new.flagged := false; new.flag_reason := null;
--     return new;
--   end if;
