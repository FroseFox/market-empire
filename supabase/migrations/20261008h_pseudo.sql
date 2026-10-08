-- Pseudo choisi par le joueur (au lieu du nom du compte Discord ou Google, souvent le vrai nom avec Google).
-- Le nom n'est écrit que par cette fonction : 3 à 20 caractères, pas déjà pris, un changement par minute au plus.
alter table public.players add column if not exists name_at timestamptz;

create or replace function public.set_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  cur text;
  last timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(clean) < 3 or char_length(clean) > 20
     or clean !~ '^[[:alnum:]]([[:alnum:] _.-]*[[:alnum:]])?$'
     or lower(clean) ~ '(admin|moderat|modérat|market ?empire|officiel|support)' then
    return jsonb_build_object('error', 'invalid');
  end if;
  select p.name, p.name_at into cur, last from public.players p where p.id = me;
  if not found then return jsonb_build_object('error', 'no_player'); end if;
  if cur = clean then return jsonb_build_object('name', clean); end if;
  if last is not null and last > now() - interval '1 minute' then return jsonb_build_object('error', 'wait'); end if;
  if exists (select 1 from public.players p where p.id <> me and lower(p.name) = lower(clean)) then
    return jsonb_build_object('error', 'taken');
  end if;
  update public.players p set name = clean, name_at = now() where p.id = me;
  return jsonb_build_object('name', clean);
end $$;

revoke all on function public.set_name(text) from public, anon;
grant execute on function public.set_name(text) to authenticated;
