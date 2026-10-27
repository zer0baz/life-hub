# Life Hub (« Ma vie »)

Hub personnel : un tableau de bord et des modules. Le premier module, **Dépenses**, suit le budget par période de salaire.
L'interface reprend la maquette « Life Hub — Prototype ».

- Front : Angular 21 (composants standalone, signals, sans zone.js)
- Back : Supabase (Auth + Postgres avec règles RLS)

## Démarrer

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Applique le schéma : colle les fichiers de `supabase/migrations/` dans l'éditeur SQL de Supabase et exécute-les dans l'ordre
   (ou `supabase db push` avec la CLI Supabase).
3. Dans `src/environments/environment.ts`, mets l'URL du projet et la clé `anon` / `publishable`
   (Project Settings › API). Cette clé est publique par conception : ce sont les règles RLS qui protègent les données.
4. Dans Supabase › Authentication › URL Configuration, ajoute l'URL de l'app (ex. `http://localhost:4200`) aux Redirect URLs
   (utilisée par la confirmation d'e-mail et le mot de passe oublié).
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
    auth/          connexion, création de compte, nouveau mot de passe
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
