-- Comptes secondaires : une opération payée depuis un autre compte reste visible mais n'impacte pas le budget.
-- Le compte principal (budget salaire) est implicite : operations.account_id null.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  kind text not null default 'bank' check (kind in ('bank', 'meal_voucher', 'eco_voucher', 'cash', 'other')),
  -- compte archivé : masqué à la saisie, toujours affiché sur ses opérations
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index accounts_user_idx on public.accounts (user_id);

alter table public.accounts enable row level security;

create policy "own rows" on public.accounts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- restrict : un compte encore lié à des opérations ne peut qu'être archivé, jamais supprimé
alter table public.operations add column account_id uuid references public.accounts (id) on delete restrict;

create index operations_account_idx on public.operations (account_id) where account_id is not null;
