import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Toast } from '../../../core/toast';
import { ExpensesStore } from '../data/expenses-store';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from '../domain/constants';
import { amountToInput, parseAmount } from '../domain/format';
import { OperationKind } from '../domain/models';

interface FormState {
  kind: OperationKind;
  amount: string;
  label: string;
  category: string;
  date: string;
  method: string;
  note: string;
}

const DEFAULTS: Record<OperationKind, Pick<FormState, 'category' | 'method'>> = {
  expense: { category: 'alim', method: 'Bancontact' },
  income: { category: 'vente', method: 'Virement' },
};

/** Ajout (route « ajouter ») ou modification (route « operations/:id ») d'une opération ponctuelle. */
@Component({
  selector: 'app-operation-form',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './operation-form.html',
  styles: `
    .card { padding: 28px; max-width: 640px; gap: 22px; }
    .form-title { font-size: 18px; font-weight: 700; }
    .amount-input { height: 56px; font-size: 24px; font-weight: 600; }
    .actions { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; }
    .inline-link { font-size: 13px; min-height: 0; }
  `,
})
export class OperationForm {
  private readonly store = inject(ExpensesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);

  /** Identifiant de l'opération à modifier, lié depuis le paramètre de route. */
  readonly id = input<string>();

  readonly form = signal<FormState>(this.empty());
  readonly error = signal('');
  readonly busy = signal(false);
  readonly notFound = signal(false);

  readonly methods = PAYMENT_METHODS;
  readonly categories = computed(() => (this.form().kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES));
  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() =>
    !this.isEdit() ? 'Nouvelle opération' : this.form().kind === 'income' ? 'Modifier le revenu' : 'Modifier la dépense');

  constructor() {
    // Pré-remplit le formulaire dès que l'opération est disponible (elle peut arriver après le chargement).
    effect(() => {
      const id = this.id();
      const loading = this.store.loading();
      const op = id ? this.store.operations().find((x) => x.id === id) : undefined;
      untracked(() => {
        if (!id) return this.form.set(this.empty());
        if (op) {
          this.notFound.set(false);
          this.form.set({ kind: op.kind, amount: amountToInput(op.amount), label: op.label, category: op.category, date: op.date, method: op.method, note: op.note });
        } else if (!loading) {
          this.notFound.set(true);
        }
      });
    });
  }

  private empty(): FormState {
    return { kind: 'expense', amount: '', label: '', date: this.store.today(), note: '', ...DEFAULTS.expense };
  }

  patch(p: Partial<FormState>) {
    this.form.update((f) => ({ ...f, ...p }));
  }

  setKind(kind: OperationKind) {
    if (this.form().kind !== kind) this.patch({ kind, ...DEFAULTS[kind] });
  }

  cancel() {
    this.router.navigateByUrl(this.isEdit() ? '/depenses/operations' : '/depenses');
  }

  async save() {
    const f = this.form();
    const amount = parseAmount(f.amount);
    if (!(amount > 0)) return this.error.set('Indique un montant valide (ex. 12,50).');
    if (!f.label.trim()) return this.error.set('Ajoute un libellé.');
    if (!f.date) return this.error.set('Choisis une date.');
    this.error.set('');
    this.busy.set(true);
    try {
      await this.store.saveOperation(
        { kind: f.kind, amount, label: f.label.trim(), category: f.category, date: f.date, method: f.method, note: f.note.trim() },
        this.id(),
      );
      const inc = f.kind === 'income';
      this.toast.show((inc ? 'Revenu' : 'Dépense') + (this.isEdit() ? (inc ? ' modifié' : ' modifiée') : inc ? ' ajouté' : ' ajoutée'));
      await this.router.navigateByUrl('/depenses/operations');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
