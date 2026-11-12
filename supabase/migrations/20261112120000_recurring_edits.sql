-- Modification d'un modèle récurrent sans réécrire les périodes passées :
-- l'ancien modèle s'arrête la veille de la date d'effet, un nouveau modèle prend le relais à cette date.

-- Premier jour couvert : aucune échéance avant cette date. Null : dès start_month.
alter table public.recurring_templates add column start_date date;
-- Modèle remplacé par celui-ci (masqué de la liste, ses échéances passées restent).
alter table public.recurring_templates
  add column replaces uuid references public.recurring_templates (id) on delete set null;
