import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Icon } from '../../../core/icon';
import { Toast } from '../../../core/toast';
import { ExpensesStore } from '../data/expenses-store';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../domain/constants';
import { fmtMinus, fmtMoney } from '../domain/format';
import { byDateDesc, occurrenceRow, operationRow, Row } from '../domain/rows';
import { OverrideEditor } from '../override-editor';

type TypeFilter = 'all' | 'income' | 'charge' | 'var';

@Component({
  selector: 'app-operations',
  imports: [FormsModule, Icon, OverrideEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './operations.html',
  styles: `
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .search { position: relative; flex: 1 1 260px; max-width: 360px; }
    .search app-icon { position: absolute; left: 12px; top: 14px; color: var(--muted); }
    .search .input { padding-left: 36px; }
    .select-cat { flex: 0 1 220px; }
    .select-type { flex: 0 1 200px; }
    .caption { font-size: 13px; font-weight: 600; color: var(--ink-2); margin-right: 4px; }
    .cat { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-2); }
    .label-cell { font-weight: 500; }
    .no-rows { padding: 40px 20px; text-align: center; color: var(--muted); }
  `,
})
export class Operations {
  protected readonly store = inject(ExpensesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);

  readonly periodIndex = signal(0);
  readonly search = signal('');
  readonly category = signal('all');
  readonly type = signal<TypeFilter>('all');
  readonly editKey = signal<string | null>(null);

  readonly categoryOptions = [{ id: 'all', label: 'Toutes les catégories' }, ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

  /** Périodes de la plus ancienne à la plus récente, pour les puces. */
  readonly periodChips = computed(() => this.store.periods().map((p, i) => ({ label: p.short, index: i })).reverse());

  readonly rows = computed(() => {
    const s = this.store.summaries()[Math.min(this.periodIndex(), this.store.summaries().length - 1)];
    const today = this.store.today();
    const all = [
      ...s.occurrences.map(occurrenceRow),
      ...[...s.variables, ...s.extras].map((x) => operationRow(x, today)),
      ...s.offBudget.map((x) => operationRow(x, today, this.store.accountLabel(x.accountId))),
    ].sort(byDateDesc);
    const q = this.search().trim().toLowerCase();
    const cat = this.category();
    const type = this.type();
    return all.filter((r) =>
      (cat === 'all' || r.category === cat) &&
      (type === 'all' ||
        (type === 'charge' && r.isRecurring && !r.isIncome) ||
        (type === 'var' && !r.isRecurring && !r.isIncome) ||
        (type === 'income' && r.isIncome)) &&
      (!q || r.label.toLowerCase().includes(q)));
  });

  readonly totals = computed(() => {
    const sum = (l: Row[]) => l.reduce((a, x) => a + x.amount, 0);
    const rows = this.rows();
    return { in: '+ ' + fmtMoney(sum(rows.filter((r) => r.isIncome))), out: fmtMinus(sum(rows.filter((r) => !r.isIncome))) };
  });

  edit(r: Row) {
    if (r.isRecurring) this.editKey.set(r.key);
    else this.router.navigate(['/depenses/operations', r.key]);
  }

  async remove(r: Row) {
    if (!confirm(`Supprimer « ${r.label} » ?`)) return;
    try {
      await this.store.removeOperation(r.key);
      this.toast.show('Opération supprimée');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    }
  }
}
