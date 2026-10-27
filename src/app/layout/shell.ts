import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Auth } from '../core/auth';
import { Icon } from '../core/icon';
import { ExpensesStore } from '../features/expenses/data/expenses-store';
import { fmtLongDate } from '../features/expenses/domain/format';
import { EXPENSE_TABS } from '../features/expenses/expenses-layout';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly store = inject(ExpensesStore);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );

  readonly inExpenses = computed(() => this.url().startsWith('/depenses'));
  readonly pageTitle = computed(() => (this.inExpenses() ? 'Dépenses' : 'Tableau de bord'));
  readonly subTitle = computed(() => {
    const path = this.url().split('?')[0];
    if (/^\/depenses\/operations\/[^/]+$/.test(path)) return 'Modifier';
    const seg = path.split('/')[2] ?? '';
    return EXPENSE_TABS.find((t) => t.path === seg)?.label ?? '';
  });
  readonly todayLabel = computed(() => fmtLongDate(this.store.today()));
}
