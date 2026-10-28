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
  /** '' = compte principal. */
  accountId: string;
}

const DEFAULT_CATEGORY: Record<OperationKind, string> = { expense: 'alim', income: 'vente' };

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
  readonly mainAccountLabel = computed(() => this.store.accountLabel(null));
  /** Comptes actifs, plus le compte archivé de l'opération modifiée pour ne pas le perdre. */
  readonly accounts = computed(() => {
    const current = this.form().accountId;
    return this.store.accounts().filter((a) => !a.archived || a.id === current)
      .map((a) => ({ id: a.id, label: this.store.accountLabel(a.id) }));
  });
  /** Moyen imposé par le compte choisi (chèques repas…) : le champ est alors masqué. */
  readonly fixedMethod = computed(() => this.store.fixedMethod(this.form().accountId || null));
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
          this.form.set({ kind: op.kind, amount: amountToInput(op.amount), label: op.label, category: op.category, date: op.date, method: op.method, note: op.note, accountId: op.accountId ?? '' });
        } else if (!loading) {
          this.notFound.set(true);
        }
      });
    });
  }

  private empty(): FormState {
    return {
      kind: 'expense', amount: '', label: '', date: this.store.today(), note: '', accountId: '',
      category: DEFAULT_CATEGORY.expense, method: this.methodFor('expense', ''),
    };
  }

  /** Moyen proposé : celui imposé par le compte, sinon un virement pour un revenu, sinon le moyen par défaut du compte. */
  private methodFor(kind: OperationKind, accountId: string): string {
    const id = accountId || null;
    return this.store.fixedMethod(id) ?? (kind === 'income' ? 'Virement' : this.store.defaultMethod(id));
  }

  patch(p: Partial<FormState>) {
    this.form.update((f) => ({ ...f, ...p }));
  }

  setKind(kind: OperationKind) {
    const f = this.form();
    if (f.kind !== kind) this.patch({ kind, category: DEFAULT_CATEGORY[kind], method: this.methodFor(kind, f.accountId) });
  }

  setAccount(accountId: string) {
    this.patch({ accountId, method: this.methodFor(this.form().kind, accountId) });
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
        { kind: f.kind, amount, label: f.label.trim(), category: f.category, date: f.date, method: f.method, note: f.note.trim(), accountId: f.accountId || null },
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
