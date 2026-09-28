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
| `supabase/schema.sql` | Schéma de la base Supabase (cours, actualités, joueurs) |
| `supabase/functions/refresh-news/` | Fonction qui récupère les actualités chaque heure (flux RSS + Finnhub) |
| `src/lib/auth.ts`, `src/lib/online.ts` | Connexion Discord et sauvegarde en ligne |

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
(`supabase/functions/refresh-market`) les met à jour **une seule fois par heure** : pg_cron l'appelle
à h:05, :07, :09, :11 et :13, chaque appel traitant un lot de 45 actifs (limite Finnhub : 60 requêtes / minute).

| Table | Contenu | Fréquence |
|---|---|---|
| `asset_prices` | Dernier cours, en euros (Finnhub + taux BCE ; cryptos : CoinGecko) | 1 h |
| `market_series` (`1h`) | Points horaires → courbes 1 jour et 1 semaine | 1 h |
| `market_series` (`1d`) | Clôtures quotidiennes (Twelve Data ; cryptos : CoinGecko) → courbes 1 mois et 1 an | 1 fois par jour |
| `news` | Titres et liens d'actualités (Le Monde, BFM, Franceinfo, Investing.com, Journal du Coin, Finnhub) | 1 h |

Chaque actif affiche un statut **Réel** (cours de marché) ou **Fictif** (aucune source : cours simulé).

Les sociétés étrangères sont cotées via leur cotation américaine (action ou ADR), ramenée au prix d'une action sur leur place d'origine.

Clés à ajouter dans Supabase → **Edge Functions → Secrets** : `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`.
Sans clé, le jeu utilise des cours simulés.

## Comptes (Discord)

Les joueurs se connectent avec Discord (Supabase Auth). Données enregistrées, au minimum :
une ligne publique `players` (pseudo, avatar, pays, ville, patrimoine, population) et une ligne privée `saves`
(la partie, allégée). Écriture au plus une fois par minute, seulement si la partie a changé.
Chaque joueur peut supprimer son compte depuis le menu de son avatar.

Configuration (une fois) :
1. <https://discord.com/developers/applications> → *New Application* → **OAuth2** : copier le *Client ID*,
   générer le *Client Secret*, ajouter la *Redirect* `https://elpkixotuarcymalehjs.supabase.co/auth/v1/callback`.
2. Supabase → **Authentication → Sign In / Providers → Discord** : activer, coller l'ID et le secret.
3. Supabase → **Authentication → URL Configuration** : *Site URL* `https://frosefox.github.io/market-empire/`,
   *Redirect URLs* : `https://frosefox.github.io/market-empire/**`.
