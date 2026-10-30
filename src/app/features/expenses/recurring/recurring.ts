import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../../core/icon';
import { Toast } from '../../../core/toast';
import { ExpensesStore } from '../data/expenses-store';
import { EXPENSE_CATEGORIES, FREQUENCIES, INCOME_COLOR, PAYMENT_METHODS, expenseCategory } from '../domain/constants';
import { amountToInput, fmtDate, fmtLongDate, fmtMoney, parseAmount } from '../domain/format';
import { RecurringTemplate, TemplateKind } from '../domain/models';
import { amountAt, dueDayLabel, frequencyLabel, nextDue, payInfo, periodFor } from '../domain/periods';

interface TemplateForm {
  kind: TemplateKind;
  label: string;
  amount: string;
  every: number;
  day: string;
  startMonth: string;
  method: string;
  category: string;
}

/** Changement de montant en cours de saisie pour un modèle. */
interface AmountEdit {
  id: string;
  amount: string;
  /** Période à partir de laquelle le nouveau montant s'applique. */
  from: 'current' | 'next';
}

@Component({
  selector: 'app-recurring',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurring.html',
  styles: `
    .payday { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
    .payday .field { width: 160px; }
    .payday .field-wide { width: 260px; }
    .moves { display: flex; flex-direction: column; gap: 10px; }
    .move { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .move .who { min-width: 220px; }
    .move .input { width: 170px; }
    .check { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; color: var(--ink-2); cursor: pointer; }
    .check input { width: 18px; height: 18px; accent-color: var(--accent); }
    .tpl-form { border: 1px solid var(--line); border-radius: 12px; padding: 20px; background: var(--surface-2); display: flex; flex-direction: column; gap: 16px; }
    .end { display: flex; justify-content: flex-end; }
    .table { min-width: 760px; }
    .actions { display: inline-flex; gap: 2px; justify-content: flex-end; }
    .amount-edit { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 4px 0 8px; }
    .amount-edit .field { width: 180px; }
    .amount-edit .field-wide { width: 260px; }
    tr.stopped td { color: var(--ink-3); }
    .name { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; }
    .card .table th:first-child, .card .table td:first-child { padding-left: 0; }
    .card .table th:last-child, .card .table td:last-child { padding-right: 0; }
  `,
})
export class Recurring {
  protected readonly store = inject(ExpensesStore);
  private readonly toast = inject(Toast);

  readonly methods = PAYMENT_METHODS;
  readonly frequencies = FREQUENCIES;
  readonly categories = EXPENSE_CATEGORIES;
  protected readonly fmtDate = fmtDate;

  // --- Période de salaire ---
  payDayInput = '';
  rankInput = '';
  constructor() {
    effect(() => {
      const s = this.store.settings();
      this.payDayInput = String(s.payDay);
      this.rankInput = String(s.workdayRank ?? 1);
    });
  }

  async setRule(rule: 'fixed' | 'workday') {
    await this.persist({ workdayRank: rule === 'workday' ? Math.max(1, parseInt(this.rankInput, 10) || 1) : null });
  }

  async savePayDay() {
    const v = parseInt(this.payDayInput, 10);
    if (!(v >= 1 && v <= 31) || v === this.store.settings().payDay) return;
    await this.persist({ payDay: v });
  }

  async saveRank() {
    const v = parseInt(this.rankInput, 10);
    if (!(v >= 1 && v <= 10) || v === this.store.settings().workdayRank) return;
    await this.persist({ workdayRank: v });
  }

  private async persist(patch: { payDay?: number; workdayRank?: number | null }) {
    try {
      await this.store.saveSettings(patch);
      this.toast.show('Période de salaire mise à jour');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
      await this.store.load();
    }
  }

  /** Salaires reportables : celui qui ouvre la période en cours, les deux suivants, puis les reports déjà faits. */
  readonly pays = computed(() => {
    const settings = this.store.settings();
    const [y, m] = this.store.current().period.payMonth.split('-').map(Number);
    const months = [0, 1, 2].map((i) => {
      const k = y * 12 + m - 1 + i;
      return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
    });
    for (const ym of Object.keys(settings.moved).sort()) if (!months.includes(ym)) months.push(ym);
    return months.map((ym) => {
      const info = payInfo(settings, ym);
      return { ...info, label: 'Salaire prévu le ' + fmtLongDate(info.regular), opens: periodFor(settings, info.actual).title };
    });
  });

  /** Dates en cours de saisie, enregistrées seulement au clic (la saisie au clavier passe par des dates intermédiaires). */
  readonly moveDrafts = signal<Partial<Record<string, string>>>({});

  draftMove(month: string, date: string) {
    const actual = payInfo(this.store.settings(), month).actual;
    this.moveDrafts.update(({ [month]: _, ...rest }) => (date && date !== actual ? { ...rest, [month]: date } : rest));
  }

  async movePay(month: string, date: string) {
    const info = payInfo(this.store.settings(), month);
    if (date < info.min || date > info.max) {
      this.toast.show(`Date hors limites : entre le ${fmtDate(info.min)} et le ${fmtDate(info.max)}.`);
      return;
    }
    this.draftMove(month, '');
    await this.savePayMove(month, date === info.regular ? null : date);
  }

  async savePayMove(month: string, date: string | null) {
    try {
      await this.store.movePayDate(month, date);
      this.toast.show(date ? 'Salaire reporté au ' + fmtDate(date) : 'Date prévue rétablie');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
      await this.store.load();
    }
  }

  readonly upcomingPays = computed(() => {
    const p = this.store.current().period;
    const settings = this.store.settings();
    const out = [p.next];
    while (out.length < 3) out.push(periodFor(settings, out[out.length - 1]).next);
    return out.map(fmtDate).join(', ');
  });

  // --- Modèles ---
  readonly showForm = signal(false);
  readonly form = signal<TemplateForm>(this.emptyForm());
  readonly formError = signal('');
  readonly busy = signal(false);

  private emptyForm(): TemplateForm {
    const t = this.store.today();
    const [y, m] = t.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    return { kind: 'charge', label: '', amount: '', every: 1, day: '1', startMonth: nextMonth, method: 'Domiciliation', category: 'logement' };
  }

  patch(p: Partial<TemplateForm>) {
    this.form.update((f) => ({ ...f, ...p }));
  }

  setKind(kind: TemplateKind) {
    this.patch({ kind, method: kind === 'income' ? 'Virement' : 'Domiciliation' });
  }

  toggleForm() {
    this.showForm.update((v) => !v);
    this.formError.set('');
  }

  async saveTemplate() {
    const f = this.form();
    const amount = parseAmount(f.amount);
    const day = parseInt(f.day, 10);
    if (!f.label.trim()) return this.formError.set('Ajoute un libellé.');
    if (!(amount > 0)) return this.formError.set('Indique un montant valide.');
    if (f.kind === 'charge' && !(day >= 1 && day <= 31)) return this.formError.set("Le jour d'échéance doit être entre 1 et 31.");
    const isCharge = f.kind === 'charge';
    // Un modèle mensuel s'applique dès la période en cours ; les autres à partir du premier mois choisi.
    const startMonth = f.every === 1 ? this.store.current().period.start.slice(0, 7) : f.startMonth || this.emptyForm().startMonth;
    this.busy.set(true);
    try {
      await this.store.addTemplate({
        kind: f.kind, label: f.label.trim(), amount, every: f.every, day: isCharge ? day : null, startMonth,
        method: f.method, category: isCharge ? f.category : null, onPayday: !isCharge,
      });
      this.form.set(this.emptyForm());
      this.showForm.set(false);
      this.formError.set('');
      this.toast.show('Modèle créé');
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  // --- Changement de montant (versionné) ---
  readonly amountEdit = signal<AmountEdit | null>(null);
  readonly editError = signal('');
  readonly periodChoices = computed(() => {
    const p = this.store.current().period;
    return { current: p.title, next: periodFor(this.store.settings(), p.next).title };
  });

  startAmountEdit(t: RecurringTemplate) {
    this.editError.set('');
    this.amountEdit.set({ id: t.id, amount: amountToInput(amountAt(t, this.store.today())), from: 'current' });
  }

  patchAmountEdit(p: Partial<AmountEdit>) {
    this.amountEdit.update((e) => (e ? { ...e, ...p } : e));
  }

  async saveAmount() {
    const e = this.amountEdit();
    if (!e) return;
    const amount = parseAmount(e.amount);
    if (!(amount > 0)) return this.editError.set('Indique un montant valide.');
    const p = this.store.current().period;
    this.busy.set(true);
    try {
      await this.store.setTemplateAmount(e.id, e.from === 'current' ? p.start : p.next, amount);
      this.amountEdit.set(null);
      this.toast.show('Montant mis à jour, les périodes précédentes ne changent pas');
    } catch (err) {
      this.editError.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async stop(t: RecurringTemplate) {
    if (!confirm(`Arrêter « ${t.label} » ? Les échéances déjà passées restent dans l'historique, celles à venir disparaissent.`)) return;
    try {
      await this.store.stopTemplate(t.id, this.store.today());
      this.toast.show('Modèle arrêté');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    }
  }

  async remove(t: RecurringTemplate) {
    const msg = `Supprimer définitivement « ${t.label} » ? Ses occurrences disparaîtront aussi des périodes passées.`
      + (t.endDate ? '' : '\nPour simplement ne plus la compter, utilise plutôt « Arrêter ».');
    if (!confirm(msg)) return;
    try {
      await this.store.removeTemplate(t.id);
      this.toast.show('Modèle supprimé');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    }
  }

  readonly rows = computed(() => {
    const current = this.store.current().period;
    const today = this.store.today();
    return [...this.store.templates()]
      .sort((a, b) => Number(!!a.endDate) - Number(!!b.endDate) || (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1))
      .map((t) => {
        const isIncome = t.kind === 'income';
        const nd = nextDue(t, current, today);
        const stopped = !!t.endDate && t.endDate <= today;
        return {
          template: t,
          color: isIncome ? INCOME_COLOR : expenseCategory(t.category).color,
          kindLabel: isIncome ? 'Revenu' : 'Charge · ' + expenseCategory(t.category).label,
          freqLabel: frequencyLabel(t.every),
          dayLabel: dueDayLabel(t),
          nextLabel: stopped ? 'Arrêté le ' + fmtDate(t.endDate!) : nd ? fmtDate(nd) : '—',
          amountLabel: (isIncome ? '+ ' : '') + fmtMoney(amountAt(t, nd ?? today)),
          isIncome,
          stopped,
        };
      });
  });
}
