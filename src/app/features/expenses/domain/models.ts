export type TemplateKind = 'income' | 'charge';
export type OperationKind = 'expense' | 'income';
export type AccountKind = 'bank' | 'meal_voucher' | 'eco_voucher' | 'cash' | 'other';

/** Réglages de la période de salaire d'un utilisateur. */
export interface PaySettings {
  payDay: number;
  /** N-ième jour ouvrable avant la fin du mois (1 = dernier). Null : jour fixe `payDay`. */
  workdayRank: number | null;
  /** Reports ponctuels : 'YYYY-MM' du salaire normalement versé ce mois-là → date réelle. */
  moved: Record<string, string>;
}

/** Compte principal (budget salaire), implicite : seuls son nom et son moyen par défaut sont réglables. */
export interface MainAccount {
  /** Null : libellé générique. */
  label: string | null;
  defaultMethod: string;
}

/** Modèle récurrent : génère une occurrence par échéance dans chaque période. */
export interface RecurringTemplate {
  id: string;
  kind: TemplateKind;
  label: string;
  /** Montant initial, valable jusqu'au premier changement de `amounts`. */
  amount: number;
  /** Changements de montant datés, triés par date d'effet croissante. */
  amounts: AmountChange[];
  /** Tous les N mois : 1, 3, 6 ou 12. */
  every: number;
  /** Jour d'échéance (charges). Null pour un revenu, daté au jour du salaire. */
  day: number | null;
  /** Premier mois concerné, format YYYY-MM. */
  startMonth: string;
  method: string;
  category: string | null;
  onPayday: boolean;
  /** Modèle arrêté : aucune échéance après cette date. */
  endDate: string | null;
}

/** Nouveau montant d'un modèle, appliqué aux échéances à partir de `fromDate`. */
export interface AmountChange {
  fromDate: string;
  amount: number;
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
  /** Compte secondaire ; null = compte principal (budget salaire). */
  accountId: string | null;
}

/** Compte secondaire : ses opérations sont visibles mais hors budget. */
export interface Account {
  id: string;
  label: string;
  kind: AccountKind;
  /** Moyen de paiement proposé à la saisie (ignoré si le type impose le sien). */
  defaultMethod: string;
  /** Compte archivé : masqué à la saisie, toujours affiché sur ses opérations. */
  archived: boolean;
}

export interface Period {
  start: string;
  /** Mois (YYYY-MM) dont le salaire ouvre la période, clé d'un éventuel report. */
  payMonth: string;
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
  /** Opérations payées depuis un compte secondaire : visibles, exclues du reste. */
  offBudget: Operation[];
  /** Dépenses hors budget de la période. */
  offBudgetTotal: number;
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
