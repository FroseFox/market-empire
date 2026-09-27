# Market Empire — prototype v0.1 (Phase 1)

Jeu web de stratégie économique : investir en bourse sur de vraies actions, et utiliser ses gains pour faire grandir une ville.

## Lancer le jeu

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests du moteur économique
```

Sans configuration, le jeu tourne en **mode démo** : les cours sont simulés (même prix pour tout le monde, à chaque rechargement). La partie est sauvegardée dans le navigateur.

## Brancher les vrais cours

1. Créer une clé gratuite sur https://finnhub.io
2. Copier `.env.example` en `.env.local` et y mettre la clé
3. Relancer `npm run dev` : le badge en haut passe à « Cours réels »

⚠️ L'offre gratuite Finnhub est réservée à un usage personnel. Avant d'ouvrir le jeu à d'autres joueurs, passer sur une offre qui autorise l'affichage public des prix.
Les actions européennes (LVMH, Airbus…) peuvent ne pas être couvertes par l'offre gratuite : elles restent alors en cours simulés.

## Où sont les choses

| Fichier | Rôle |
|---|---|
| `src/lib/game/config.ts` | **Tous les chiffres d'équilibrage** (bâtiments, prix, durée d'un jour…) |
| `src/lib/game/engine.ts` | Moteur économique pur : ville, patrimoine, achat/vente, construction, passage des jours |
| `src/lib/game/insights.ts` | Alertes et objectifs |
| `src/lib/market/` | Univers d'actions, cours simulés, fournisseur Finnhub |
| `src/app/api/` | Routes serveur `/api/quotes` et `/api/history` (le client n'appelle jamais Finnhub directement) |
| `supabase/schema.sql` | Schéma de la future base en ligne, avec achat/vente et construction exécutés côté serveur |

## Règles de temps

- La **bourse** suit le temps réel.
- La **ville** avance d'un jour toutes les 60 min réelles (`DAY_LENGTH_MINUTES`). Au retour du joueur, jusqu'à 24 jours sont rattrapés.
- Le bouton « Avancer d'un jour » (page Ville) est un outil de test du prototype.

## Mettre le site en ligne gratuitement (sans rien installer)

Tout se fait depuis le navigateur.

1. **GitHub** : créer un dépôt vide (ex. `market-empire`) et y envoyer ce code.
2. **Vercel** (offre Hobby, gratuite, usage personnel non commercial) : « Add New → Project », importer le dépôt GitHub. Vercel détecte Next.js tout seul.
3. **Variables d'environnement** (Vercel → Settings → Environment Variables) :
   - `FINNHUB_API_KEY` : clé gratuite sur finnhub.io, pour les vrais cours
   - `LOGO_DEV_KEY` : clé sur logo.dev, pour les logos des entreprises (reste privée, côté serveur)
4. Chaque modification poussée sur GitHub redéploie le site automatiquement.
