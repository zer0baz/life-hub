export type TemplateKind = 'income' | 'charge';
export type OperationKind = 'expense' | 'income';

/** Réglages de la période de salaire d'un utilisateur. */
export interface PaySettings {
  payDay: number;
  lastWorkday: boolean;
}

/** Modèle récurrent : génère une occurrence par échéance dans chaque période. */
export interface RecurringTemplate {
  id: string;
  kind: TemplateKind;
  label: string;
  amount: number;
  /** Tous les N mois : 1, 3, 6 ou 12. */
  every: number;
  /** Jour d'échéance (charges). Null pour un revenu, daté au jour du salaire. */
  day: number | null;
  /** Premier mois concerné, format YYYY-MM. */
  startMonth: string;
  method: string;
  category: string | null;
  onPayday: boolean;
}

/** Montant ajusté pour une occurrence précise d'un modèle. */
export interface Override {
  templateId: string;
  dueDate: string;
  amount: number;
}

/** Opération ponctuelle (dépense variable ou revenu ponctuel). */
export interface Operation {
  id: string;
  kind: OperationKind;
  date: string;
  label: string;
  category: string;
  method: string;
  amount: number;
  note: string;
}

export interface Period {
  start: string;
  end: string;
  /** Prochain jour de salaire (début de la période suivante). */
  next: string;
  /** Nom du mois financé, ex. « novembre 2026 ». */
  name: string;
  /** Ex. « Période de novembre ». */
  title: string;
  /** Ex. « nov. 26 ». */
  short: string;
}

export interface Occurrence {
  key: string;
  template: RecurringTemplate;
  due: string;
  amount: number;
  edited: boolean;
  upcoming: boolean;
}

export interface PeriodSummary {
  period: Period;
  occurrences: Occurrence[];
  incomes: Occurrence[];
  charges: Occurrence[];
  variables: Operation[];
  extras: Operation[];
  extraTotal: number;
  income: number;
  chargesTotal: number;
  varTotal: number;
  /** Charges récurrentes encore à venir dans la période. */
  due: number;
  out: number;
  rest: number;
}

export interface Category {
  id: string;
  label: string;
  color: string;
}
