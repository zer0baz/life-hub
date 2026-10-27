import { INCOME_COLOR, expenseCategory, incomeCategory } from './constants';
import { fmtDate, fmtMoney } from './format';
import { Occurrence, Operation } from './models';
import { frequencyLabel } from './periods';

/** Ligne affichable, issue d'une occurrence récurrente ou d'une opération ponctuelle. */
export interface Row {
  key: string;
  date: string;
  dateLabel: string;
  label: string;
  category: string | null;
  catLabel: string;
  color: string;
  method: string;
  amount: number;
  amountLabel: string;
  isIncome: boolean;
  isRecurring: boolean;
  edited: boolean;
  upcoming: boolean;
  statusLabel: string;
  freqLabel: string;
  occurrence?: Occurrence;
  operation?: Operation;
}

const status = (isIncome: boolean, upcoming: boolean) =>
  isIncome ? (upcoming ? 'Prévu' : 'Reçu') : upcoming ? 'Prévue' : 'Payée';

export function occurrenceRow(o: Occurrence): Row {
  const isIncome = o.template.kind === 'income';
  const c = isIncome ? { color: INCOME_COLOR, label: 'Revenu' } : expenseCategory(o.template.category);
  return {
    key: o.key, date: o.due, dateLabel: fmtDate(o.due), label: o.template.label, category: o.template.category,
    catLabel: c.label, color: c.color, method: o.template.method, amount: o.amount,
    amountLabel: (isIncome ? '+ ' : '') + fmtMoney(o.amount), isIncome, isRecurring: true, edited: o.edited,
    upcoming: o.upcoming, statusLabel: status(isIncome, o.upcoming), freqLabel: frequencyLabel(o.template.every), occurrence: o,
  };
}

export function operationRow(x: Operation, today: string): Row {
  const isIncome = x.kind === 'income';
  const c = isIncome ? incomeCategory(x.category) : expenseCategory(x.category);
  const upcoming = x.date > today;
  return {
    key: x.id, date: x.date, dateLabel: fmtDate(x.date), label: x.label, category: x.category,
    catLabel: c.label, color: c.color, method: x.method, amount: x.amount,
    amountLabel: (isIncome ? '+ ' : '') + fmtMoney(x.amount), isIncome, isRecurring: false, edited: false,
    upcoming, statusLabel: status(isIncome, upcoming), freqLabel: '', operation: x,
  };
}

export const byDateDesc = (a: Row, b: Row) => b.date.localeCompare(a.date);
