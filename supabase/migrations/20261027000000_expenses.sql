-- Module Dépenses : réglages de période, modèles récurrents, montants ajustés, opérations ponctuelles.
-- Chaque ligne appartient à un utilisateur ; la sécurité au niveau des lignes (RLS) limite l'accès à ses propres données.

create table public.expense_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pay_day smallint not null default 28 check (pay_day between 1 and 31),
  last_workday boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'charge')),
  label text not null check (length(trim(label)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  every smallint not null default 1 check (every in (1, 3, 6, 12)),
  day smallint check (day between 1 and 31),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  method text not null,
  category text,
  on_payday boolean not null default false,
  created_at timestamptz not null default now(),
  -- une charge a un jour d'échéance ; un revenu est daté au jour du salaire
  check (on_payday or day is not null)
);

create table public.recurring_overrides (
  template_id uuid not null references public.recurring_templates (id) on delete cascade,
  due_date date not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  primary key (template_id, due_date)
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  date date not null,
  label text not null check (length(trim(label)) > 0),
  category text not null,
  method text not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index recurring_templates_user_idx on public.recurring_templates (user_id);
create index recurring_overrides_user_idx on public.recurring_overrides (user_id);
create index operations_user_date_idx on public.operations (user_id, date desc);

alter table public.expense_settings enable row level security;
alter table public.recurring_templates enable row level security;
alter table public.recurring_overrides enable row level security;
alter table public.operations enable row level security;

create policy "own rows" on public.expense_settings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.recurring_templates
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.recurring_overrides
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.operations
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
