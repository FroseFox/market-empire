# Market Empire — prototype v0.1 (Phase 1)

Jeu web de stratégie économique : investir en bourse sur de vraies actions, et utiliser ses gains pour faire grandir une ville.

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests du moteur économique
```

Sans configuration, le jeu tourne en **mode démo** : les cours sont simulés (même prix pour tout le monde, à chaque rechargement). La partie est sauvegardée dans le navigateur.

## Vrais cours en local

1. Copier `.env.example` en `.env.local` et y mettre les clés
2. `npm run data` (écrit `public/data/`), puis `npm run dev`

## Où sont les choses

| Fichier | Rôle |
|---|---|
| `src/lib/game/config.ts` | **Tous les chiffres d'équilibrage** (bâtiments, prix, durée d'un jour…) |
| `src/lib/game/engine.ts` | Moteur économique pur : ville, patrimoine, achat/vente, construction, passage des jours |
| `src/lib/game/insights.ts` | Alertes et objectifs |
| `src/lib/market/` | Univers d'actions, cours simulés, fournisseur Finnhub |
| `scripts/build-data.mts` | Récupère les cours et l'historique avant chaque publication (clés API côté GitHub uniquement) |
| `supabase/schema.sql` | Schéma de la future base en ligne, avec achat/vente et construction exécutés côté serveur |

## Règles de temps

- La **bourse** suit le temps réel.
- La **ville** avance d'un jour toutes les 60 min réelles (`DAY_LENGTH_MINUTES`). Au retour du joueur, jusqu'à 24 jours sont rattrapés.
- Le bouton « Avancer d'un jour » (page Ville) est un outil de test du prototype.

## Mettre le site en ligne gratuitement : GitHub Pages

Le site est 100 % statique. GitHub Actions le reconstruit à chaque envoi sur `main`,
et toutes les 15 minutes en semaine pour mettre à jour les cours (fichier `.github/workflows/deploy.yml`).

Réglages à faire une fois, dans le dépôt GitHub :

1. **Settings → Pages → Build and deployment → Source : GitHub Actions**
2. **Settings → Secrets and variables → Actions**
   - onglet *Secrets* → `FINNHUB_API_KEY` (cours réels) et `TWELVE_DATA_API_KEY` (vraies courbes), tous deux optionnels
   - onglet *Variables* → `LOGO_DEV_KEY` (clé publique Logo.dev, pour les logos), optionnelle
3. Onglet **Actions** → « Déployer sur GitHub Pages » → **Run workflow** pour la première publication.

Le site est alors en ligne à l'adresse `https://<compte>.github.io/market-empire/`.

Sans clé, tout fonctionne avec des cours simulés.

## Où vivent les données de marché

| Fichier publié | Contenu | Fréquence |
|---|---|---|
| `data/quotes.json` | Derniers cours (Finnhub), convertis en euros (taux BCE) | 15 min |
| `data/intraday.json` | Courbe du jour, construite point par point | 15 min |
| `data/history/*.json` | Courbes 1 semaine et 1 an (Twelve Data) | 1 fois par jour |
| `news.json` | Actualités | à la main |
