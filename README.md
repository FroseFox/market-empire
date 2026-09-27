# Market Empire — prototype v0.1 (Phase 1)

Jeu web de stratégie économique : investir en bourse sur de vraies actions, et utiliser ses gains pour faire grandir une ville.

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests du moteur économique
```

Sans configuration, le jeu tourne en **mode démo** : les cours sont simulés (même prix pour tout le monde, à chaque rechargement). La partie est sauvegardée dans le navigateur.

## Où sont les choses

| Fichier | Rôle |
|---|---|
| `src/lib/game/config.ts` | **Tous les chiffres d'équilibrage** (bâtiments, prix, durée d'un jour…) |
| `src/lib/game/engine.ts` | Moteur économique pur : ville, patrimoine, achat/vente, construction, passage des jours |
| `src/lib/game/insights.ts` | Alertes et objectifs |
| `src/lib/market/` | Univers d'actions, cours simulés, fournisseur Finnhub |
| `supabase/functions/refresh-market/` | Fonction qui récupère les cours chaque heure (clés API côté Supabase uniquement) |
| `supabase/schema.sql` | Schéma de la future base en ligne, avec achat/vente et construction exécutés côté serveur |

## Règles de temps

- La **bourse** suit le temps réel.
- La **ville** avance d'un jour toutes les 60 min réelles (`DAY_LENGTH_MINUTES`). Au retour du joueur, jusqu'à 24 jours sont rattrapés.
- Le bouton « Avancer d'un jour » (page Ville) est un outil de test du prototype.

## Mettre le site en ligne gratuitement : GitHub Pages

Le site est 100 % statique et publié par GitHub Actions à chaque envoi sur `main` (`.github/workflows/deploy.yml`).

Réglages à faire une fois, dans le dépôt GitHub :

1. **Settings → Pages → Build and deployment → Source : GitHub Actions**
2. *(Optionnel)* **Settings → Secrets and variables → Actions → Variables** → `LOGO_DEV_KEY` (clé publique Logo.dev)
3. Onglet **Actions** → « Déployer sur GitHub Pages » → **Run workflow**

Adresse : `https://<compte>.github.io/market-empire/`

## Cours de bourse : Supabase

Environ 200 actifs : actions américaines, européennes, asiatiques et d'autres pays, ETF, matières premières et cryptomonnaies.
La liste est dans `src/lib/market/universe.ts` ; `npx tsx scripts/assets-sql.mts > supabase/assets.sql` génère le SQL qui synchronise la table `assets`.

Le site lit les cours dans la base Supabase (lecture seule). Une fonction Supabase
(`supabase/functions/refresh-market`) est appelée **toutes les 10 minutes** (tâche `pg_cron`) et met à jour les actifs par lots :

| Table | Contenu | Fréquence |
|---|---|---|
| `asset_prices` | Dernier cours, en euros (Finnhub + taux BCE ; cryptos : CoinGecko) | ≈ 1 h par action, 10 min pour les cryptos |
| `market_series` (`1h`) | Points horaires → courbes 1 jour et 1 semaine | 1 h |
| `market_series` (`1d`) | Clôtures quotidiennes (Twelve Data ; cryptos : CoinGecko) → courbes 1 mois et 1 an | 1 fois par jour |

Les sociétés étrangères sont cotées via leur cotation américaine (action ou ADR), ramenée au prix d'une action sur leur place d'origine.

Clés à ajouter dans Supabase → **Edge Functions → Secrets** : `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`.
Sans clé, le jeu utilise des cours simulés.
