# Life Hub (« Ma vie »)

Hub personnel : un tableau de bord et des modules. Le premier module, **Dépenses**, suit le budget par période de salaire.
L'interface reprend la maquette « Life Hub — Prototype ».

- Front : Angular 21 (composants standalone, signals, sans zone.js)
- Back : Supabase (Auth Google + Postgres avec règles RLS)

## Démarrer

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Applique le schéma : colle `supabase/migrations/20261027000000_expenses.sql` dans l'éditeur SQL de Supabase et exécute-le
   (ou `supabase db push` avec la CLI Supabase).
3. Dans `src/environments/environment.ts`, mets l'URL du projet et la clé `anon` / `publishable`
   (Project Settings › API). Cette clé est publique par conception : ce sont les règles RLS qui protègent les données.
4. Active la connexion Google (seule méthode de connexion de l'app) :
   - Google Cloud Console › APIs & Services › écran de consentement OAuth : type « External », renseigne nom et e-mail.
   - Credentials › Create credentials › OAuth client ID › « Web application » :
     - Authorized JavaScript origins : `http://localhost:4200` (+ l'URL de prod plus tard)
     - Authorized redirect URIs : `https://<ton-projet>.supabase.co/auth/v1/callback`
   - Supabase › Authentication › Sign In / Providers › Google : active-le et colle le Client ID et le Client Secret.
   - Supabase › Authentication › URL Configuration : Site URL = l'URL de l'app, et ajoute `http://localhost:4200` aux Redirect URLs.
   - Désactive le provider « Email » dans Supabase : l'app ne propose plus que Google, et aucun compte ne pourra être créé autrement.
5. Lance l'app :

```bash
npm install
npm start        # http://localhost:4200
npm test         # tests unitaires (Vitest)
npm run build
```

## Structure

```
src/app/
  core/            client Supabase, authentification, gardes de route, toast, icônes
  layout/          barre latérale + en-tête
  features/
    auth/          connexion Google
    dashboard/     tableau de bord
    expenses/
      domain/      logique pure : périodes de salaire, occurrences récurrentes, totaux (testée)
      data/        store (signals) + accès Supabase
      overview/ operations/ operation-form/ recurring/ stats/   écrans du module
supabase/migrations/   schéma SQL
```

## Règles métier du module Dépenses

- Une **période** va d'un jour de salaire à la veille du suivant (jour 1–31, ou dernier jour ouvrable du mois).
  Elle porte le nom du mois qu'elle finance : salaire du 28/10 → « Période de novembre ».
- Un **modèle récurrent** (salaire, loyer, assurance…) génère ses occurrences dans chaque période concernée,
  selon sa fréquence (mensuelle, trimestrielle, semestrielle, annuelle). Un revenu est daté au jour du salaire.
- Le crayon sur une occurrence ajuste **uniquement ce mois-là** (ex. salaire réel) ; le modèle n'est pas modifié.
- Les **opérations ponctuelles** sont les dépenses variables et les revenus ponctuels.
