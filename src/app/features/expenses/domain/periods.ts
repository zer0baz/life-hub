import { EXPENSE_CATEGORIES, FREQUENCIES, MONTHS, MONTHS_SHORT, expenseCategory } from './constants';
import { fmtMoney } from './format';
import { Occurrence, Operation, Override, PaySettings, Period, PeriodSummary, RecurringTemplate } from './models';

// Toutes les dates sont manipulées en UTC pour éviter les décalages d'heure d'été.
const DAY_MS = 86_400_000;

const toDate = (iso: string) => new Date(iso + 'T00:00:00Z');
const toIso = (dt: Date) => dt.toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** 'YYYY-MM' → index de mois absolu (année * 12 + mois). */
const monthIndex = (ym: string) => {
  const [y, m] = ym.split('-');
  return Number(y) * 12 + Number(m) - 1;
};
const dueInMonth = (k: number, day: number) => {
  const y = Math.floor(k / 12), m = k % 12;
  return toIso(new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)))));
};

export function overrideKey(templateId: string, due: string): string {
  return templateId + ':' + due;
}

/** Jour de salaire du mois m (0–11) de l'année y. */
export function payDate(settings: PaySettings, y: number, m: number): Date {
  if (settings.lastWorkday) {
    const dt = new Date(Date.UTC(y, m, daysInMonth(y, m)));
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() - 1);
    return dt;
  }
  const day = settings.payDay >= 1 && settings.payDay <= 31 ? settings.payDay : 28;
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))));
}

/** Période de salaire contenant la date donnée. Elle porte le nom du mois qu'elle finance. */
export function periodFor(settings: PaySettings, isoDate: string): Period {
  const t = toDate(isoDate);
  let y = t.getUTCFullYear(), m = t.getUTCMonth();
  let start = payDate(settings, y, m);
  if (t < start) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
    start = payDate(settings, y, m);
  }
  let ny = y, nm = m + 1;
  if (nm > 11) { nm = 0; ny += 1; }
  const next = payDate(settings, ny, nm);
  const end = new Date(next.getTime() - DAY_MS);
  const month = MONTHS[nm];
  const elide = /^[aeiouéâ]/i.test(month);
  return {
    start: toIso(start),
    end: toIso(end),
    next: toIso(next),
    name: `${month} ${ny}`,
    title: (elide ? "Période d'" : 'Période de ') + month,
    short: `${MONTHS_SHORT[nm]} ${String(ny).slice(2)}`,
  };
}

/** La période courante puis les `count - 1` précédentes. */
export function recentPeriods(settings: PaySettings, today: string, count: number): Period[] {
  const out = [periodFor(settings, today)];
  while (out.length < count) {
    const prevDay = new Date(toDate(out[out.length - 1].start).getTime() - DAY_MS);
    out.push(periodFor(settings, toIso(prevDay)));
  }
  return out;
}

export function occurrencesFor(
  period: Period,
  templates: RecurringTemplate[],
  overrides: Map<string, Override>,
  today: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  const s = toDate(period.start), e = toDate(period.end);
  for (const t of templates) {
    const dues: string[] = [];
    const si = monthIndex(t.startMonth);
    if (t.onPayday) {
      if (monthIndex(period.start.slice(0, 7)) >= si) dues.push(period.start);
    } else if (t.day != null) {
      const k0 = s.getUTCFullYear() * 12 + s.getUTCMonth();
      const k1 = e.getUTCFullYear() * 12 + e.getUTCMonth();
      for (let k = k0; k <= k1; k++) {
        if (k < si || (k - si) % t.every !== 0) continue;
        const due = dueInMonth(k, t.day);
        if (due >= period.start && due <= period.end) dues.push(due);
      }
    }
    for (const due of dues) {
      const key = overrideKey(t.id, due);
      const ov = overrides.get(key);
      out.push({ key, template: t, due, amount: ov ? ov.amount : t.amount, edited: !!ov, upcoming: due > today });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** Prochaine échéance d'un modèle à partir d'aujourd'hui. */
export function nextDue(t: RecurringTemplate, current: Period, today: string): string | null {
  if (t.onPayday) return current.next;
  if (t.day == null) return null;
  const T = toDate(today);
  const base = T.getUTCFullYear() * 12 + T.getUTCMonth();
  const si = monthIndex(t.startMonth);
  for (let k = base; k < base + 36; k++) {
    if (k < si || (k - si) % t.every !== 0) continue;
    const due = dueInMonth(k, t.day);
    if (due >= today) return due;
  }
  return null;
}

export function summarize(
  period: Period,
  templates: RecurringTemplate[],
  overrides: Map<string, Override>,
  operations: Operation[],
  today: string,
): PeriodSummary {
  const occurrences = occurrencesFor(period, templates, overrides, today);
  const incomes = occurrences.filter((o) => o.template.kind === 'income');
  const charges = occurrences.filter((o) => o.template.kind === 'charge');
  const inPeriod = operations.filter((x) => x.date >= period.start && x.date <= period.end);
  const variables = inPeriod.filter((x) => x.kind !== 'income');
  const extras = inPeriod.filter((x) => x.kind === 'income');
  const sum = (l: { amount: number }[]) => l.reduce((a, x) => a + x.amount, 0);
  const extraTotal = sum(extras);
  const income = sum(incomes) + extraTotal;
  const chargesTotal = sum(charges);
  const varTotal = sum(variables);
  return {
    period, occurrences, incomes, charges, variables, extras, extraTotal, income, chargesTotal, varTotal,
    due: sum(charges.filter((o) => o.upcoming)),
    out: chargesTotal + varTotal,
    rest: income - chargesTotal - varTotal,
  };
}

export interface CategoryShare {
  label: string;
  color: string;
  pct: number;
  amountLabel: string;
}

/** Sorties (charges + variables) d'une période, réparties par catégorie de dépense. */
export function breakdown(summary: PeriodSummary): CategoryShare[] {
  const items = summary.charges
    .map((o) => ({ category: o.template.category, amount: o.amount }))
    .concat(summary.variables.map((x) => ({ category: x.category, amount: x.amount })));
  const total = items.reduce((a, x) => a + x.amount, 0) || 1;
  return EXPENSE_CATEGORIES
    .map((c) => ({ c, sum: items.filter((x) => expenseCategory(x.category).id === c.id).reduce((a, x) => a + x.amount, 0) }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .map((x) => ({ label: x.c.label, color: x.c.color, pct: Math.round((x.sum / total) * 100), amountLabel: fmtMoney(x.sum) }));
}

export function frequencyLabel(every: number): string {
  return FREQUENCIES.find((f) => f.every === every)?.label ?? `Tous les ${every} mois`;
}

/** Ex. « Le 10 · mars » ou « Jour du salaire ». */
export function dueDayLabel(t: RecurringTemplate): string {
  if (t.onPayday) return 'Jour du salaire';
  let txt = 'Le ' + (t.day === 1 ? '1er' : t.day);
  if (t.every > 1) {
    const s = monthIndex(t.startMonth) % 12;
    const months: string[] = [];
    for (let m = 0; m < 12; m++) if ((((m - s) % t.every) + t.every) % t.every === 0) months.push(MONTHS_SHORT[m]);
    txt += ' · ' + months.join(', ');
  }
  return txt;
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((toDate(toIsoDate).getTime() - toDate(fromIso).getTime()) / DAY_MS);
}
