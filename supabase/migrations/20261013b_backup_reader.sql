-- Compte de la sauvegarde nocturne (.github/workflows/backup.yml) : lecture seule, aucune écriture possible.
-- Créé sans connexion ; le propriétaire du projet l'active avec son propre mot de passe, dans l'éditeur SQL de Supabase :
--   alter role backup_reader login password '...';
-- (le même mot de passe va dans le secret GitHub SUPABASE_DB_PASSWORD). Le mot de passe principal de la base n'est plus utilisé.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin;
  end if;
end $$;
grant pg_read_all_data to backup_reader;
-- pg_dump lit les tables protégées par RLS (sauvegardes, abonnements…) : sans ce droit, il s'arrête net.
alter role backup_reader bypassrls;
