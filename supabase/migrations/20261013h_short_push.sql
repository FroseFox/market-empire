-- Notifications de l'appareil plus courtes : un titre de quelques mots, une ligne de texte.
create or replace function public.push_on_contract() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_city text;
begin
  select p.city_name into v_city from public.players p where p.id = new.buyer;
  perform public.push_enqueue(new.seller, 'contract', 'Nouveau contrat',
    format('%s : %s %s/jour', left(coalesce(v_city, 'Une ville'), 30), new.qty,
      case new.resource when 'energy' then 'énergie' else 'nourriture' end), 'monde');
  return new;
end $$;

create or replace function public.push_on_shares() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_city text;
begin
  if tg_op = 'UPDATE' and new.qty <= old.qty then return new; end if;
  select p.city_name into v_city from public.players p where p.id = new.holder;
  perform public.push_enqueue(new.city, 'shares', 'Parts achetées',
    format('%s en détient %s', left(coalesce(v_city, 'Une ville'), 30), new.qty), 'monde');
  return new;
end $$;

create or replace function public.push_on_blockade() returns trigger language plpgsql security definer set search_path to '' as $$
declare m record;
begin
  if new.blockade_target is null or (new.blockade_target is not distinct from old.blockade_target
     and new.blockade_until is not distinct from old.blockade_until) then return new; end if;
  for m in select p.id from public.players p where p.alliance = new.blockade_target loop
    perform public.push_enqueue(m.id, 'blockade', 'Blocus',
      format('[%s] bloque vos exportations 3 jours', new.tag), 'monde');
  end loop;
  return new;
end $$;

-- Mention : « Léo vous mentionne » + le début du message (80 caractères au plus).
create or replace function public.push_on_mention() returns trigger language plpgsql security definer set search_path to '' as $$
declare
  r record;
  sent integer := 0;
  v_alliance uuid := null;
  v_body text := lower(new.body);
  v_text text := regexp_replace(new.body, '\s+', ' ', 'g');
begin
  if new.hidden or strpos(new.body, '@') = 0 then return new; end if;
  if new.room <> 'global' then v_alliance := new.room::uuid; end if;
  if char_length(v_text) > 80 then v_text := left(v_text, 79) || '…'; end if;
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
    perform public.push_enqueue(r.id, 'mention', left(new.name, 24) || ' vous mentionne', v_text, '');
    sent := sent + 1;
    exit when sent >= 5;
  end loop;
  return new;
exception when others then return new; -- une notification ne doit jamais empêcher un message
end $$;
