-- Jour de salaire : N-ième jour ouvrable avant la fin du mois, et reports ponctuels.

-- null : jour fixe (pay_day) ; 1 = dernier jour ouvrable, 2 = avant-dernier…
alter table public.expense_settings add column workday_rank smallint check (workday_rank between 1 and 10);
update public.expense_settings set workday_rank = 1 where last_workday;
-- last_workday n'est plus lu par l'app ; à supprimer une fois la nouvelle version déployée.

-- Report ponctuel : le salaire normalement versé le mois `month` l'est le `pay_date`.
create table public.pay_date_overrides (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  pay_date date not null,
  primary key (user_id, month)
);

alter table public.pay_date_overrides enable row level security;

create policy "own rows" on public.pay_date_overrides
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
