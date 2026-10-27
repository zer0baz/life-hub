import { ChangeDetectionStrategy, Component, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Toast } from '../../core/toast';
import { ExpensesStore } from './data/expenses-store';
import { amountToInput, parseAmount } from './domain/format';
import { Row } from './domain/rows';

/**
 * Montant d'une occurrence récurrente, avec édition en place.
 * Modifie uniquement cette occurrence (ex. salaire réel du mois) ; le modèle n'est pas touché.
 */
@Component({
  selector: 'app-override-editor',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'override-editor' },
  template: `
    @if (editing()) {
      <label class="sr" [for]="inputId()">Montant ajusté</label>
      <input [id]="inputId()" class="input input-inline" inputmode="decimal" [(ngModel)]="value" (keydown.enter)="save()"
             (keydown.escape)="editing.set(false)">
      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="save()">OK</button>
      <button type="button" class="btn btn-ghost btn-sm" (click)="editing.set(false)">Annuler</button>
    } @else {
      <span class="amount num" [class.pos]="row().isIncome">{{ row().amountLabel }}</span>
      @if (showPencil()) {
        <button type="button" class="icon-btn" [attr.aria-label]="'Modifier le montant de ' + row().label" (click)="editing.set(true)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      }
    }
  `,
  styles: `:host { display: inline-flex; align-items: center; gap: 6px; } .amount { font-weight: 600; }`,
})
export class OverrideEditor {
  private readonly store = inject(ExpensesStore);
  private readonly toast = inject(Toast);

  readonly row = input.required<Row>();
  readonly showPencil = input(true);
  readonly editing = model(false);

  readonly busy = signal(false);
  readonly inputId = () => 'ov-' + this.row().key.replace(/[^a-zA-Z0-9-]/g, '-');
  value = '';

  constructor() {
    effect(() => {
      if (this.editing()) this.value = amountToInput(this.row().amount);
    });
  }

  async save() {
    const occ = this.row().occurrence;
    const amount = parseAmount(this.value);
    if (!occ || !(amount >= 0)) return;
    this.busy.set(true);
    try {
      await this.store.setOverride(occ.template.id, occ.due, amount);
      this.editing.set(false);
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
