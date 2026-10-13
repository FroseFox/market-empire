-- Chat (2/2) : à lancer dans l'éditeur SQL de Supabase (les commandes d'effacement y demandent une confirmation).
-- 1. Supprimer son compte efface aussi ses messages, signalements et exclusions.
alter table public.chat_messages add constraint chat_messages_author_fkey foreign key (author) references public.players(id) on delete cascade;
alter table public.chat_reports add constraint chat_reports_message_fkey foreign key (message) references public.chat_messages(id) on delete cascade;
alter table public.chat_reports add constraint chat_reports_reporter_fkey foreign key (reporter) references public.players(id) on delete cascade;
alter table public.chat_bans add constraint chat_bans_player_fkey foreign key (player) references public.players(id) on delete cascade;
-- 2. Toutes les 10 minutes : les messages de plus de 24 h et les exclusions terminées disparaissent.
select cron.schedule('chat-cleanup', '*/10 * * * *', $cron$
  delete from public.chat_messages where created_at < now() - interval '24 hours';
  delete from public.chat_bans where until < now();
$cron$);
