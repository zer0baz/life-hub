import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../../core/icon';
import { ExpensesStore } from './data/expenses-store';
import { fmtDate } from './domain/format';

export const EXPENSE_TABS = [
  { path: '', label: "Vue d'ensemble" },
  { path: 'operations', label: 'Opérations' },
  { path: 'ajouter', label: 'Ajouter' },
  { path: 'recurrent', label: 'Récurrent' },
  { path: 'comptes', label: 'Comptes' },
  { path: 'statistiques', label: 'Statistiques' },
];

@Component({
  selector: 'app-expenses-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = store.current().period;
    <div class="head">
      <div class="card-head">
        <div>
          <h1 class="page-title">Dépenses</h1>
          <p class="muted sub">{{ p.title }} · du {{ fmtDate(p.start) }} au {{ fmtDate(p.end) }}</p>
        </div>
        <a class="btn btn-primary" routerLink="/depenses/ajouter"><app-icon name="plus" [size]="16" /> Nouvelle opération</a>
      </div>
      <nav aria-label="Navigation du module Dépenses" class="tabs">
        @for (t of tabs; track t.path) {
          <a class="tab" [routerLink]="t.path ? '/depenses/' + t.path : '/depenses'" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">{{ t.label }}</a>
        }
      </nav>
    </div>
    <div class="body">
      @if (store.error()) { <p role="alert" class="alert">{{ store.error() }}</p> }
      <router-outlet />
    </div>
  `,
  styles: `
    :host { display: block; }
    /* Reste collée sous la topbar du shell pendant que le contenu défile. */
    .head {
      position: sticky; top: var(--topbar-h); z-index: 10;
      background: #fff; border-bottom: 1px solid var(--line); padding: 24px 32px 0;
    }
    .page-title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    .sub { margin-top: 4px; }
    .btn { text-decoration: none; }
    .tabs { display: flex; flex-wrap: wrap; gap: 0 28px; margin-top: 18px; }
    .tab {
      display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; border-bottom: 2px solid transparent;
      color: var(--ink-3); font-size: 14px; font-weight: 500; text-decoration: none;
      &:hover { color: var(--ink); }
      &.is-active { color: var(--accent-strong); border-bottom-color: var(--accent); }
    }
    .body { padding: 28px 32px; max-width: 1200px; width: 100%; }
    .body .alert { margin-bottom: 16px; }
    @media (max-width: 600px) {
      .head { padding: 12px 16px 0; }
      .page-title { font-size: 20px; }
      .card-head .btn { min-height: 36px; padding: 0 12px; font-size: 13px; }
      /* Onglets sur une ligne, défilables horizontalement, pour garder un en-tête compact. */
      .tabs { flex-wrap: nowrap; gap: 0 20px; margin-top: 8px; overflow-x: auto; scrollbar-width: none; }
      .tab { flex: none; white-space: nowrap; }
      .body { padding: 20px 16px; }
    }
  `,
})
export class ExpensesLayout {
  protected readonly store = inject(ExpensesStore);
  protected readonly tabs = EXPENSE_TABS;
  protected readonly fmtDate = fmtDate;
}
