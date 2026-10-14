-- Notifications : un bouton « Tester » et le ménage des abonnements morts.

-- Envoie une notification de test à tous les appareils du joueur (au plus une par minute).
-- Renvoie le nombre d'appareils abonnés, ou -1 si un test est déjà parti il y a moins d'une minute.
create or replace function public.push_test() returns integer language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.push_queue q where q.user_id = me and q.kind = 'test' and q.created_at > now() - interval '1 minute') then return -1; end if;
  select count(*) into n from public.push_subs s where s.user_id = me;
  perform public.push_enqueue(me, 'test', 'Notification de test', 'Les notifications marchent sur cet appareil.', '');
  return n;
end $$;
revoke all on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;

-- Abonnement mort : un appareil abonné renvoie son abonnement à chaque ouverture du jeu (created_at est alors remis à
-- maintenant). Si l'appli a été désinstallée, ou le navigateur a changé d'abonnement, l'ancien n'est plus jamais
-- renvoyé — et les services de notifications l'acceptent parfois encore longtemps sans rien livrer.
-- Chaque nuit : on retire ceux qui n'ont pas été renvoyés depuis 30 jours.
select cron.schedule('push-subs-cleanup', '37 4 * * *', $cron$
  delete from public.push_subs where created_at < now() - interval '30 days';
$cron$);
