-- Historique des modèles récurrents : un changement de montant ou un arrêt ne réécrit plus les périodes passées.
-- recurring_templates.amount reste le montant initial ; chaque changement ajoute une ligne datée dans recurring_amounts.

create table public.recurring_amounts (
  template_id uuid not null references public.recurring_templates (id) on delete cascade,
  -- date d'effet : le montant s'applique aux échéances à partir de ce jour
  from_date date not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  primary key (template_id, from_date)
);

create index recurring_amounts_user_idx on public.recurring_amounts (user_id);

alter table public.recurring_amounts enable row level security;

create policy "own rows" on public.recurring_amounts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Modèle arrêté : plus aucune échéance après cette date, les précédentes restent.
alter table public.recurring_templates add column end_date date;
