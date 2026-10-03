-- Market Empire — visites de villes et déménagement de pays.
-- Purement additif : une colonne et deux fonctions. Rien d'existant n'est modifié.
-- Tant que ce fichier n'est pas appliqué : visites et déménagement en ligne indisponibles, le reste du jeu fonctionne.

-- Plan public de la ville (emplacements regroupés par type de bâtiment), lu seulement lors d'une visite.
alter table public.players
  add column if not exists city jsonb check (city is null or pg_column_size(city) <= 16384);

-- Publie le plan de sa propre ville.
create or replace function public.publish_city(p_city jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_city is null or jsonb_typeof(p_city) <> 'object' or pg_column_size(p_city) > 16384 then return false; end if;
  update public.players set city = p_city where id = auth.uid();
  return found;
end $$;

-- Installe sa ville dans un autre pays jouable. Renvoie false si le pays est déjà pris.
-- (Le prix du pays est débité par le jeu, comme toutes les dépenses de la partie.)
create or replace function public.move_country(p_country text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_country is null or not (p_country = any (array['124','840','484','076','032','152','170','604','862','826','250','724','620','276','380','528','056','756','040','616','752','578','246','208','300','792','642','804','203','348','372','643','398','156','392','410','356','360','764','704','458','608','586','682','784','376','818','504','012','566','710','404','231','288','036','554'])) then return false; end if;
  begin
    update public.players set country = p_country, updated_at = now() where id = auth.uid();
    return found;
  exception when unique_violation then
    return false;
  end;
end $$;

revoke all on function public.publish_city(jsonb) from public, anon;
revoke all on function public.move_country(text) from public, anon;
grant execute on function public.publish_city(jsonb) to authenticated;
grant execute on function public.move_country(text) to authenticated;
