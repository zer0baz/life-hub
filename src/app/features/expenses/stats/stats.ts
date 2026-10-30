import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ExpensesStore } from '../data/expenses-store';
import { fmtMoney } from '../domain/format';
import { breakdown, offBudgetBreakdown } from '../domain/periods';

@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = selected();
    <div class="stack">
      <section class="card" style="gap: 16px; border-radius: 12px">
        <div class="card-head" style="align-items: baseline">
          <h2 class="card-title">Sorties par période</h2>
          <span class="hint">Clique sur une période pour la détailler</span>
        </div>
        <div class="bars">
          @for (b of bars(); track b.index) {
            <button type="button" class="bar-btn" [class.is-active]="b.index === index()" [attr.aria-pressed]="b.index === index()"
                    [attr.aria-label]="b.label + ' : ' + b.totalLabel" (click)="index.set(b.index)">
              <span class="total num">{{ b.totalLabel }}</span>
              <span class="bar" [style.height.px]="b.h"></span>
            </button>
          }
        </div>
        <div class="bar-labels" aria-hidden="true">
          @for (b of bars(); track b.index) { <span>{{ b.label }}</span> }
        </div>
      </section>

      <div class="grid-sm">
        <div class="kpi">
          <div class="hint">Revenus · {{ s.period.name }}</div>
          <div class="value pos">{{ fmt(s.income) }}</div>
        </div>
        <div class="kpi">
          <div class="hint">Sorties totales</div>
          <div class="value value-row">
            {{ fmt(s.out) }}
            @if (s.offBudgetTotal > 0) {
              <span class="tag off-tag" title="Payé via d'autres comptes, non déduit du reste"
                    aria-label="Payé via d'autres comptes, non déduit du reste">+{{ fmt(s.offBudgetTotal) }} hors budget</span>
            }
          </div>
          <div class="hint">{{ fmt(s.chargesTotal) }} récurrentes · {{ fmt(s.varTotal) }} variables</div>
        </div>
        <div class="kpi">
          <div class="hint">Reste de la période</div>
          <div class="value" [class.neg]="s.rest < 0" [class.pos]="s.rest >= 0">{{ fmt(s.rest) }}</div>
          <div class="hint">{{ s.income ? round((s.rest / s.income) * 100) : 0 }} % des revenus</div>
        </div>
        <div class="kpi">
          <div class="hint">Plus grosse dépense variable</div>
          <div class="value">{{ biggest() ? fmt(biggest()!.amount) : '—' }}</div>
          <div class="hint">{{ biggest()?.label }}</div>
        </div>
      </div>

      <section class="card" style="border-radius: 12px">
        <h2 class="card-title">Répartition par catégorie · {{ s.period.name }}</h2>
        @for (c of categories(); track c.label) {
          <div class="bar-row">
            <span class="name"><span class="dot dot-sm" [style.background]="c.color"></span>{{ c.label }}</span>
            <div class="track" style="height: 10px"><div [style.width.%]="c.pct" [style.background]="c.color"></div></div>
            <span class="pct">{{ c.pct }} %</span>
            <span class="val">{{ c.amountLabel }}</span>
          </div>
        } @empty {
          <p class="empty">Aucune sortie sur cette période.</p>
        }
      </section>

      @if (s.offBudgetTotal > 0) {
        <section class="card off-budget" style="border-radius: 12px">
          <div class="card-head" style="align-items: baseline">
            <h2 class="card-title">Hors budget · {{ s.period.name }}</h2>
            <span class="hint">Payé via d'autres comptes, non déduit du reste</span>
          </div>
          @for (a of offBudget(); track a.accountId) {
            <div class="account">
              <div class="account-head">
                <strong>{{ store.accountLabel(a.accountId) }}</strong>
                <span class="muted">{{ a.pct }} % · {{ fmt(a.total) }}</span>
              </div>
              @for (c of a.categories; track c.label) {
                <div class="bar-row">
                  <span class="name"><span class="dot dot-sm" [style.background]="c.color"></span>{{ c.label }}</span>
                  <div class="track" style="height: 10px"><div [style.width.%]="c.pct" [style.background]="c.color"></div></div>
                  <span class="pct">{{ c.pct }} %</span>
                  <span class="val">{{ c.amountLabel }}</span>
                </div>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .bars { display: flex; gap: 16px; align-items: flex-end; border-bottom: 1px solid var(--line); }
    .bar-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px; height: 220px;
      border: 0; background: transparent; cursor: pointer; padding: 0;
      .bar { width: 100%; max-width: 56px; border-radius: 6px 6px 0 0; background: #C5D0FA; }
      &:hover .bar { background: #A3B4F5; }
      &.is-active .bar { background: var(--accent); }
    }
    .total { font-size: 12px; font-weight: 600; color: var(--ink-2); }
    .bar-labels { display: flex; gap: 16px; span { flex: 1; text-align: center; font-size: 12px; color: var(--ink-3); } }
    .kpi { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
    .kpi .value { margin: 6px 0 2px; font-size: 22px; font-weight: 700; }
    .value-row { display: flex; align-items: center; gap: 8px; white-space: nowrap; min-width: 0; }
    .off-tag { font-size: 12px; font-weight: 500; line-height: 18px; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .off-budget {
      .account + .account { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
      .account-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .track > div, .dot { opacity: 0.55; }
    }
  `,
})
export class Stats {
  protected readonly store = inject(ExpensesStore);
  protected readonly fmt = fmtMoney;
  protected readonly round = Math.round;

  /** 0 = période courante. */
  readonly index = signal(0);
  readonly selected = computed(() => this.store.summaries()[Math.min(this.index(), this.store.summaries().length - 1)]);

  readonly bars = computed(() => {
    const sums = this.store.summaries();
    const max = Math.max(1, ...sums.map((x) => x.out));
    return sums
      .map((x, i) => ({ index: i, label: x.period.short, totalLabel: fmtMoney(x.out), h: Math.max(4, Math.round((x.out / max) * 170)) }))
      .reverse();
  });

  readonly biggest = computed(() => [...this.selected().variables].sort((a, b) => b.amount - a.amount).at(0));
  readonly categories = computed(() => breakdown(this.selected()));
  readonly offBudget = computed(() => offBudgetBreakdown(this.selected()));
}
