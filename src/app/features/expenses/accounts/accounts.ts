import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../../core/icon';
import { Toast } from '../../../core/toast';
import { ExpensesStore } from '../data/expenses-store';
import { ACCOUNT_KINDS, FIXED_METHODS, MAIN_ACCOUNT_LABEL, PAYMENT_METHODS, accountKindLabel } from '../domain/constants';
import { fmtMoney } from '../domain/format';
import { Account, AccountKind } from '../domain/models';

interface AccountForm {
  label: string;
  kind: AccountKind;
  defaultMethod: string;
}

const EMPTY_FORM: AccountForm = { label: '', kind: 'bank', defaultMethod: 'Bancontact' };

/** Comptes secondaires : leurs opérations restent visibles mais n'impactent pas le budget. */
@Component({
  selector: 'app-accounts',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accounts.html',
  styles: `
    .acc-form { border: 1px solid var(--line); border-radius: 12px; padding: 20px; background: var(--surface-2); display: flex; flex-direction: column; gap: 16px; }
    .end { display: flex; justify-content: flex-end; }
    .actions { display: inline-flex; gap: 2px; }
    .rename { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex: 1 1 260px; }
    .rename .input { flex: 1 1 160px; height: 36px; }
    .archived .title { color: var(--ink-3); }
  `,
})
export class Accounts {
  protected readonly store = inject(ExpensesStore);
  private readonly toast = inject(Toast);

  readonly kinds = ACCOUNT_KINDS;
  readonly mainAccountLabel = MAIN_ACCOUNT_LABEL;
  readonly methods = PAYMENT_METHODS;
  readonly fixedMethods = FIXED_METHODS;
  protected readonly kindLabel = accountKindLabel;
  protected readonly fmt = fmtMoney;

  readonly showForm = signal(false);
  readonly form = signal<AccountForm>(EMPTY_FORM);
  readonly formError = signal('');
  readonly busy = signal(false);
  readonly showArchived = signal(false);
  /** Modification en cours d'un compte secondaire. */
  readonly editing = signal<{ id: string; label: string; defaultMethod: string } | null>(null);

  // --- Compte principal ---
  mainLabelInput = '';
  constructor() {
    effect(() => (this.mainLabelInput = this.store.mainAccount().label ?? ''));
  }

  async saveMainLabel() {
    const label = this.mainLabelInput.trim() || null;
    if (label === this.store.mainAccount().label) return;
    await this.persistMain({ label });
  }

  async saveMainMethod(defaultMethod: string) {
    await this.persistMain({ defaultMethod });
  }

  private async persistMain(patch: { label?: string | null; defaultMethod?: string }) {
    try {
      await this.store.saveMainAccount(patch);
      this.toast.show('Compte principal mis à jour');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
      await this.store.load();
    }
  }

  /** Comptes actifs avec le total payé sur la période courante. */
  readonly active = computed(() => {
    const off = this.store.current().offBudget.filter((x) => x.kind !== 'income');
    return this.store.activeAccounts().map((a) => ({
      account: a,
      spent: off.filter((x) => x.accountId === a.id).reduce((s, x) => s + x.amount, 0),
    }));
  });
  readonly archived = computed(() => this.store.accounts().filter((a) => a.archived));

  patch(p: Partial<AccountForm>) {
    this.form.update((f) => ({ ...f, ...p }));
  }

  toggleForm() {
    this.showForm.update((v) => !v);
    this.formError.set('');
  }

  async add() {
    const f = this.form();
    if (!f.label.trim()) return this.formError.set('Ajoute un nom.');
    this.busy.set(true);
    try {
      await this.store.addAccount({ label: f.label.trim(), kind: f.kind, defaultMethod: FIXED_METHODS[f.kind] ?? f.defaultMethod });
      this.form.set(EMPTY_FORM);
      this.showForm.set(false);
      this.formError.set('');
      this.toast.show('Compte créé');
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  startEdit(a: Account) {
    this.editing.set({ id: a.id, label: a.label, defaultMethod: a.defaultMethod });
  }

  patchEdit(p: { label?: string; defaultMethod?: string }) {
    this.editing.update((e) => e && { ...e, ...p });
  }

  async saveEdit() {
    const e = this.editing();
    if (!e || !e.label.trim()) return;
    try {
      await this.store.updateAccount(e.id, { label: e.label.trim(), defaultMethod: e.defaultMethod });
      this.editing.set(null);
      this.toast.show('Compte modifié');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    }
  }

  async remove(a: Account) {
    const n = this.store.accountUsage(a.id);
    const msg = n
      ? `« ${a.label} » est lié à ${n} opération(s) : il sera archivé et ces opérations garderont leur compte. Continuer ?`
      : `Supprimer définitivement « ${a.label} » ?`;
    if (!confirm(msg)) return;
    try {
      const archived = await this.store.removeAccount(a.id);
      this.toast.show(archived ? 'Compte archivé' : 'Compte supprimé');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    }
  }

  async restore(a: Account) {
    try {
      await this.store.restoreAccount(a.id);
      this.toast.show('Compte restauré');
    } catch (e) {
      this.toast.show('Échec : ' + (e as Error).message);
    }
  }
}
