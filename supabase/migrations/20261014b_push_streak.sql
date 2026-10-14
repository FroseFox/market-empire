-- Rappel « série de connexions » : à chaque ouverture, le jeu programme pour le lendemain 19 h (Paris) un rappel
-- « votre série de N jours vous attend ». S'il rouvre avant, le rappel est repoussé au jour suivant.
-- Même fonction que le rappel « ville pleine » ; un seul rappel de chaque sorte en attente par joueur.
create or replace function public.push_remind(p_kind text, p_at timestamptz, p_title text, p_body text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_kind is null or p_kind not in ('city_full', 'streak') then return false; end if;
  if p_at is null then
    delete from public.push_queue q where q.user_id = me and q.kind = p_kind and q.sent_at is null;
    return true;
  end if;
  if not exists (select 1 from public.push_subs s where s.user_id = me) then return false; end if;
  if length(btrim(coalesce(p_title, ''))) < 2 or length(btrim(coalesce(p_body, ''))) < 2 then return false; end if;
  if p_kind = 'city_full' then
    insert into public.push_queue as q (user_id, kind, title, body, url, send_at)
      values (me, p_kind, left(btrim(p_title), 80), left(btrim(p_body), 200), 'ville', greatest(now() + interval '5 minutes', least(p_at, now() + interval '14 days')))
      on conflict (user_id, kind) where sent_at is null and kind = 'city_full'
      do update set title = excluded.title, body = excluded.body, send_at = excluded.send_at;
  else
    delete from public.push_queue q where q.user_id = me and q.kind = p_kind and q.sent_at is null;
    insert into public.push_queue (user_id, kind, title, body, url, send_at)
      values (me, p_kind, left(btrim(p_title), 80), left(btrim(p_body), 200), '', greatest(now() + interval '5 minutes', least(p_at, now() + interval '3 days')));
  end if;
  return true;
end $$;
