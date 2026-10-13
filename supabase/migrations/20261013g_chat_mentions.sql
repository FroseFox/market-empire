-- Chat : « @Pseudo » prévient le joueur mentionné.
-- Dans le jeu, la notification est créée par le jeu lui-même (lib/chat.ts). Ici : la notification de l'appareil, quand
-- le jeu est fermé — seulement pour les joueurs qui les ont activées (push_enqueue ne fait rien sans abonnement).
-- Règles : pas soi-même ; salon d'alliance → seulement ses membres ; 5 joueurs au plus par message ; au plus une
-- notification de mention par minute et par joueur (pas de spam). Le pseudo doit être suivi d'autre chose qu'une
-- lettre ou un chiffre (« @Léo » ne prévient pas « Léonard »), et précédé d'autre chose (une adresse e-mail n'est pas une mention).
create or replace function public.push_on_mention() returns trigger language plpgsql security definer set search_path to '' as $$
declare
  r record;
  sent integer := 0;
  v_alliance uuid := null;
  v_body text := lower(new.body);
begin
  if new.hidden or strpos(new.body, '@') = 0 then return new; end if;
  if new.room <> 'global' then v_alliance := new.room::uuid; end if;
  for r in
    select p.id, p.name from public.players p
    where p.id <> new.author and char_length(coalesce(p.name, '')) >= 3
      and strpos(v_body, '@' || lower(p.name)) > 0
      and (v_alliance is null or p.alliance = v_alliance)
    order by char_length(p.name) desc
    limit 20
  loop
    if not (v_body ~ ('(^|[^[:alnum:]_])@' || regexp_replace(lower(r.name), '([.\-])', '\\\1', 'g') || '($|[^[:alnum:]_])')) then continue; end if;
    if exists (select 1 from public.push_queue q where q.user_id = r.id and q.kind = 'mention' and q.created_at > now() - interval '1 minute') then continue; end if;
    perform public.push_enqueue(r.id, 'mention', left(new.name, 50) || ' vous a mentionné', new.body, '');
    sent := sent + 1;
    exit when sent >= 5;
  end loop;
  return new;
exception when others then return new; -- une notification ne doit jamais empêcher un message
end $$;

revoke all on function public.push_on_mention() from public, anon, authenticated;

create or replace trigger push_on_mention after insert on public.chat_messages
  for each row execute function public.push_on_mention();
