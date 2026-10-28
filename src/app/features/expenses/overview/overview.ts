import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpensesStore } from '../data/expenses-store';
import { fmtDate, fmtMinus, fmtMoney } from '../domain/format';
import { breakdown } from '../domain/periods';
import { byDateDesc, occurrenceRow, operationRow } from '../domain/rows';
import { OverrideEditor } from '../override-editor';

@Component({
  selector: 'app-overview',
  imports: [RouterLink, OverrideEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.html',
  styles: `
    .card { padding: 24px; }
    .lines { display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
    .line { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line-soft); }
    .line > span:first-child { color: var(--ink-2); }
    .line strong { font-weight: 600; }
    .total { padding-top: 12px; border-top: 2px solid var(--ink); font-weight: 700; }
    .bar-row .name { width: 110px; }
  `,
})
export class Overview {
  protected readonly store = inject(ExpensesStore);
  protected readonly fmt = fmtMoney;
  protected readonly minus = fmtMinus;
  protected readonly fmtDate = fmtDate;

  readonly editKey = signal<string | null>(null);
  readonly recurring = computed(() => this.store.current().occurrences.map(occurrenceRow));
  readonly recentOps = computed(() => {
    const s = this.store.current();
    const today = this.store.today();
    return [
      ...[...s.variables, ...s.extras].map((x) => operationRow(x, today)),
      ...s.offBudget.map((x) => operationRow(x, today, this.store.accountLabel(x.accountId))),
    ].sort(byDateDesc).slice(0, 5);
  });
  readonly categories = computed(() => breakdown(this.store.current()));
}
