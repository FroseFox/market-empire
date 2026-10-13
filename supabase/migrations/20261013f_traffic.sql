-- Moins de trafic (plan gratuit : 5 Go par mois).

-- 1. Classement du Monde : le jeu ne relit que les joueurs modifiés depuis sa dernière lecture.
--    `updated_at` ne convient pas : il veut dire « dernière sauvegarde » et le garde-fou anti-triche en dépend
--    (players_guard). `changed_at` change à chaque modification de la ligne, quelle qu'elle soit.
alter table public.players add column if not exists changed_at timestamptz not null default now();
create index if not exists players_changed_at_idx on public.players (changed_at);

create or replace function public.players_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.changed_at := now();
  return new;
end $$;

drop trigger if exists players_touch on public.players;
create trigger players_touch before update on public.players
  for each row when (old.* is distinct from new.*) execute function public.players_touch();

-- 2. Chat : les nouveaux messages arrivent par le temps réel de Supabase au lieu d'une question toutes les 4 s.
--    Chacun ne reçoit que les messages qu'il a le droit de lire (règle « salons du joueur »).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
