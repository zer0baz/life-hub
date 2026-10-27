import { Category } from './models';

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'alim', label: 'Alimentation', color: '#2F9E44' },
  { id: 'logement', label: 'Logement', color: '#3B5BDB' },
  { id: 'transport', label: 'Transport', color: '#F08C00' },
  { id: 'resto', label: 'Restaurants', color: '#C2255C' },
  { id: 'loisirs', label: 'Loisirs', color: '#7048E8' },
  { id: 'sante', label: 'Santé', color: '#0C8599' },
  { id: 'abos', label: 'Abonnements', color: '#495057' },
  { id: 'autre', label: 'Autre', color: '#ADB5BD' },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'vente', label: 'Vente', color: '#2B8A3E' },
  { id: 'rembours', label: 'Remboursement', color: '#0B7285' },
  { id: 'regul', label: 'Régularisation', color: '#5C940D' },
  { id: 'cadeau', label: 'Cadeau', color: '#862E9C' },
  { id: 'autre-rev', label: 'Autre revenu', color: '#868E96' },
];

export const INCOME_COLOR = '#2B8A3E';

export const PAYMENT_METHODS = ['Bancontact', 'Carte de crédit', 'Virement', 'Domiciliation', 'Espèces'];

export const FREQUENCIES = [
  { every: 1, label: 'Mensuelle' },
  { every: 3, label: 'Trimestrielle' },
  { every: 6, label: 'Semestrielle' },
  { every: 12, label: 'Annuelle' },
];

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function expenseCategory(id: string | null): Category {
  return EXPENSE_CATEGORIES.find((c) => c.id === id) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

export function incomeCategory(id: string | null): Category {
  return INCOME_CATEGORIES.find((c) => c.id === id) ?? INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1];
}
