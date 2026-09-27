-- Données de base
insert into public.assets (symbol, provider_symbol, name, sector, country, currency) values
  ('AAPL', 'AAPL', 'Apple', 'Technologie', 'US', 'USD'),
  ('MSFT', 'MSFT', 'Microsoft', 'Technologie', 'US', 'USD'),
  ('NVDA', 'NVDA', 'NVIDIA', 'Semi-conducteurs', 'US', 'USD'),
  ('GOOGL', 'GOOGL', 'Alphabet', 'Technologie', 'US', 'USD'),
  ('AMZN', 'AMZN', 'Amazon', 'Commerce en ligne', 'US', 'USD'),
  ('META', 'META', 'Meta Platforms', 'Technologie', 'US', 'USD'),
  ('TSLA', 'TSLA', 'Tesla', 'Automobile', 'US', 'USD'),
  ('AMD', 'AMD', 'AMD', 'Semi-conducteurs', 'US', 'USD'),
  ('TSM', 'TSM', 'TSMC', 'Semi-conducteurs', 'TW', 'USD'),
  ('AVGO', 'AVGO', 'Broadcom', 'Semi-conducteurs', 'US', 'USD'),
  ('INTC', 'INTC', 'Intel', 'Semi-conducteurs', 'US', 'USD'),
  ('NFLX', 'NFLX', 'Netflix', 'Médias', 'US', 'USD'),
  ('JPM', 'JPM', 'JPMorgan Chase', 'Banque', 'US', 'USD'),
  ('V', 'V', 'Visa', 'Paiements', 'US', 'USD'),
  ('KO', 'KO', 'Coca-Cola', 'Consommation', 'US', 'USD'),
  ('XOM', 'XOM', 'ExxonMobil', 'Énergie', 'US', 'USD'),
  ('CVX', 'CVX', 'Chevron', 'Énergie', 'US', 'USD'),
  ('ASML', 'ASML', 'ASML', 'Semi-conducteurs', 'NL', 'EUR'),
  ('MC', 'MC.PA', 'LVMH', 'Luxe', 'FR', 'EUR'),
  ('TTE', 'TTE.PA', 'TotalEnergies', 'Énergie', 'FR', 'EUR'),
  ('AIR', 'AIR.PA', 'Airbus', 'Aéronautique', 'FR', 'EUR'),
  ('SAN', 'SAN.PA', 'Sanofi', 'Santé', 'FR', 'EUR'),
  ('OR', 'OR.PA', 'L''Oréal', 'Consommation', 'FR', 'EUR'),
  ('SAP', 'SAP.DE', 'SAP', 'Logiciels', 'DE', 'EUR');

insert into public.building_types (id, name, category, cost, housing, jobs, revenue, energy_prod, energy_use, food_prod, unlock_pop, buildable) values
  ('house_s', 'Petit quartier', 'housing', 20000, 100, 0, 0, 0, 0, 0, 0, true),
  ('house_m', 'Quartier résidentiel', 'housing', 75000, 500, 0, 0, 0, 0, 0, 500, true),
  ('house_l', 'Grand quartier', 'housing', 300000, 2500, 0, 0, 0, 0, 0, 2000, true),
  ('house_xl', 'Centre résidentiel', 'housing', 1500000, 15000, 0, 0, 0, 0, 0, 10000, true),
  ('shop', 'Commerce', 'commerce', 15000, 0, 40, 120, 0, 5, 0, 0, true),
  ('services', 'Entreprise de services', 'services', 100000, 0, 150, 600, 0, 15, 0, 600, true),
  ('factory_s', 'Petite usine', 'industry', 50000, 0, 100, 350, 0, 30, 0, 0, true),
  ('factory_m', 'Usine moyenne', 'industry', 250000, 0, 500, 2000, 0, 150, 0, 1500, true),
  ('factory_l', 'Complexe industriel', 'industry', 1000000, 0, 2000, 9000, 0, 600, 0, 6000, true),
  ('farm_s', 'Petite exploitation', 'agriculture', 40000, 0, 60, 100, 0, 5, 100, 0, true),
  ('farm_m', 'Exploitation moyenne', 'agriculture', 200000, 0, 200, 400, 0, 20, 700, 1500, true),
  ('farm_l', 'Grande exploitation', 'agriculture', 1000000, 0, 800, 1500, 0, 100, 5000, 8000, true),
  ('power_s', 'Petite centrale', 'energy', 50000, 0, 20, 0, 100, 0, 0, 0, true),
  ('power_m', 'Centrale moyenne', 'energy', 300000, 0, 80, 0, 750, 0, 0, 1500, true),
  ('power_l', 'Grande centrale', 'energy', 1500000, 0, 300, 0, 5000, 0, 0, 8000, true),
  ('townhall', 'Mairie', 'civic', 30000, 0, 30, 0, 0, 5, 0, 0, false),
  ('village', 'Village d''origine', 'housing', 50000, 250, 0, 0, 0, 0, 0, 0, false);

-- Création automatique du joueur et de sa ville de départ à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into players (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Joueur'));
  insert into player_buildings (player_id, building_id, count) values
    (new.id, 'village', 1),
    (new.id, 'townhall', 1),
    (new.id, 'shop', 1),
    (new.id, 'farm_s', 1),
    (new.id, 'power_s', 1);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
