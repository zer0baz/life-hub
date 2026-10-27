import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth';
import { ExpensesStore } from '../expenses/data/expenses-store';
import { fmtMoney } from '../expenses/domain/format';
import { byDateDesc, occurrenceRow, operationRow } from '../expenses/domain/rows';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styles: `.page { padding: 32px; display: flex; flex-direction: column; gap: 24px; max-width: 1200px; width: 100%; }
    .page-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
    .subtitle { margin-top: 6px; }
    .grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
    .card-title.soft { color: var(--ink-2); }
    .big-number { font-size: 32px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-3); }
    @media (max-width: 600px) { .page { padding: 20px 16px; } }`,
})
export class Dashboard {
  protected readonly auth = inject(Auth);
  protected readonly store = inject(ExpensesStore);
  protected readonly fmt = fmtMoney;

  readonly upcoming = computed(() => this.store.current().charges.filter((o) => o.upcoming).map(occurrenceRow));
  readonly recent = computed(() => {
    const s = this.store.current();
    const today = this.store.today();
    const pastCharges = s.charges.filter((o) => !o.upcoming).map(occurrenceRow);
    const ops = [...s.variables, ...s.extras].map((x) => operationRow(x, today));
    return [...pastCharges, ...ops].sort(byDateDesc).slice(0, 5);
  });
}
