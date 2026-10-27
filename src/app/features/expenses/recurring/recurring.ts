import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../../core/icon';
import { Toast } from '../../../core/toast';
import { ExpensesStore } from '../data/expenses-store';
import { EXPENSE_CATEGORIES, FREQUENCIES, INCOME_COLOR, PAYMENT_METHODS, expenseCategory } from '../domain/constants';
import { fmtDate, fmtMoney, parseAmount } from '../domain/format';
import { RecurringTemplate, TemplateKind } from '../domain/models';
import { dueDayLabel, frequencyLabel, nextDue } from '../domain/periods';

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

@Component({
  selector: 'app-recurring',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurring.html',
  styles: `
    .payday { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
    .payday .field { width: 160px; }
    .check { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; color: var(--ink-2); cursor: pointer; }
    .check input { width: 18px; height: 18px; accent-color: var(--accent); }
    .tpl-form { border: 1px solid var(--line); border-radius: 12px; padding: 20px; background: var(--surface-2); display: flex; flex-direction: column; gap: 16px; }
    .end { display: flex; justify-content: flex-end; }
    .table { min-width: 760px; }
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
  constructor() {
    effect(() => (this.payDayInput = String(this.store.settings().payDay)));
  }

  async savePayDay() {
    const v = parseInt(this.payDayInput, 10);
    if (!(v >= 1 && v <= 31) || v === this.store.settings().payDay) return;
    await this.persist({ payDay: v });
  }

  async toggleLastWorkday(checked: boolean) {
    await this.persist({ lastWorkday: checked });
  }

  private async persist(patch: { payDay?: number; lastWorkday?: boolean }) {
    try {
      await this.store.saveSettings(patch);
      this.toast.show('Période de salaire mise à jour');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
      await this.store.load();
    }
  }

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

  async remove(t: RecurringTemplate) {
    if (!confirm(`Supprimer le modèle « ${t.label} » ? Ses occurrences disparaîtront de toutes les périodes.`)) return;
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
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1))
      .map((t) => {
        const isIncome = t.kind === 'income';
        const nd = nextDue(t, current, today);
        return {
          template: t,
          color: isIncome ? INCOME_COLOR : expenseCategory(t.category).color,
          kindLabel: isIncome ? 'Revenu' : 'Charge · ' + expenseCategory(t.category).label,
          freqLabel: frequencyLabel(t.every),
          dayLabel: dueDayLabel(t),
          nextLabel: nd ? fmtDate(nd) : '—',
          amountLabel: (isIncome ? '+ ' : '') + fmtMoney(t.amount),
          isIncome,
        };
      });
  });
}
