-- Ce qui doit suivre le joueur d'un appareil à l'autre (et pas seulement rester sur l'appareil) :
-- - la version des conditions d'utilisation acceptée (on ne les redemande plus sur chaque appareil, ni dans l'appli installée) ;
-- - le dernier message du chat lu (un nouvel appareil n'affiche plus d'anciens messages comme « nouveaux »).
-- Table à part : modifier `players` relancerait la mise à jour du classement chez tous les joueurs (changed_at).
create table if not exists public.player_prefs (
  id uuid primary key references auth.users (id) on delete cascade,
  terms_version text,
  chat_seen bigint not null default 0
);
alter table public.player_prefs enable row level security;
create policy "player_prefs: le sien" on public.player_prefs for select to authenticated using (id = (select auth.uid()));

create or replace function public.accept_terms(p_version text) returns void language sql security definer set search_path to '' as $$
  insert into public.player_prefs (id, terms_version) values (auth.uid(), left(p_version, 20))
  on conflict (id) do update set terms_version = excluded.terms_version;
$$;

-- Ne fait qu'avancer (deux appareils ne se renvoient pas en arrière) ; jamais au-delà du dernier message existant.
create or replace function public.set_chat_seen(p_id bigint) returns void language sql security definer set search_path to '' as $$
  insert into public.player_prefs (id, chat_seen)
    values (auth.uid(), least(p_id, coalesce((select max(m.id) from public.chat_messages m), 0)))
  on conflict (id) do update set chat_seen = greatest(public.player_prefs.chat_seen, excluded.chat_seen);
$$;

revoke all on function public.accept_terms(text) from public, anon;
revoke all on function public.set_chat_seen(bigint) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
grant execute on function public.set_chat_seen(bigint) to authenticated;
