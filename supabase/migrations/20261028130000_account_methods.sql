-- Nom du compte principal et moyen de paiement proposé par défaut pour chaque compte.

-- null : libellé générique « Compte principal »
alter table public.expense_settings add column main_account_label text check (length(trim(main_account_label)) > 0);
alter table public.expense_settings add column main_account_method text not null default 'Bancontact';

-- ignoré pour les chèques repas, éco-chèques et espèces, dont le moyen est imposé
alter table public.accounts add column default_method text not null default 'Bancontact';
