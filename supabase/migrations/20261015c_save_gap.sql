-- Sauvegarde : 10 secondes au moins entre deux écritures (au lieu de 20). Le jeu enregistre désormais quelques secondes
-- après chaque action, et à la sortie de l'appli : avec 20 s, une action faite juste avant de quitter n'était pas
-- enregistrée. Seule la limite change dans save_game (le reste de la fonction est identique).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.save_game(jsonb,bigint,text,bigint,integer,real,integer,bigint)'::regprocedure);
  d := replace(d, 'interval ''20 seconds''', 'interval ''10 seconds''');
  execute d;
end $$;
