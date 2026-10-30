import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Auth } from '../../../core/auth';
import { Supabase } from '../../../core/supabase';
import { todayIso } from '../domain/format';
import { Account, AmountChange, MainAccount, Operation, Override, PaySettings, RecurringTemplate } from '../domain/models';
import { FIXED_METHODS, MAIN_ACCOUNT_LABEL } from '../domain/constants';
import { daysBetween, overrideKey, recentPeriods, summarize } from '../domain/periods';

/** Nombre de périodes affichées (courante + précédentes) dans les listes et statistiques. */
export const PERIOD_COUNT = 4;

const DEFAULT_SETTINGS: PaySettings = { payDay: 28, workdayRank: null, moved: {} };
const DEFAULT_MAIN_ACCOUNT: MainAccount = { label: null, defaultMethod: 'Bancontact' };

// Lignes telles que renvoyées par Supabase (snake_case, numeric en nombre ou chaîne).
interface TemplateRow {
  id: string; kind: RecurringTemplate['kind']; label: string; amount: number | string; every: number;
  day: number | null; start_month: string; method: string; category: string | null; on_payday: boolean;
  end_date: string | null;
}
interface OperationRow {
  id: string; kind: Operation['kind']; date: string; label: string; category: string; method: string;
  amount: number | string; note: string | null; account_id: string | null;
}
interface AccountRow { id: string; label: string; kind: Account['kind']; default_method: string; archived_at: string | null }
const ACCOUNT_COLUMNS = 'id, label, kind, default_method, archived_at';
interface OverrideRow { template_id: string; due_date: string; amount: number | string }
interface PayMoveRow { month: string; pay_date: string }
interface AmountRow { template_id: string; from_date: string; amount: number | string }

const toTemplate = (r: TemplateRow, amounts: AmountChange[] = []): RecurringTemplate => ({
  id: r.id, kind: r.kind, label: r.label, amount: Number(r.amount), amounts, every: r.every, day: r.day,
  startMonth: r.start_month, method: r.method, category: r.category, onPayday: r.on_payday, endDate: r.end_date,
});
const toOperation = (r: OperationRow): Operation => ({
  id: r.id, kind: r.kind, date: r.date, label: r.label, category: r.category, method: r.method,
  amount: Number(r.amount), note: r.note ?? '', accountId: r.account_id,
});
const toAccount = (r: AccountRow): Account => ({
  id: r.id, label: r.label, kind: r.kind, defaultMethod: r.default_method, archived: r.archived_at != null,
});
const toOverride = (r: OverrideRow): Override => ({ templateId: r.template_id, dueDate: r.due_date, amount: Number(r.amount) });

export type NewTemplate = Omit<RecurringTemplate, 'id' | 'amounts' | 'endDate'>;
export type OperationInput = Omit<Operation, 'id'>;
export type AccountInput = Pick<Account, 'label' | 'kind' | 'defaultMethod'>;

/** Violation de clé étrangère côté Postgres. */
const FK_VIOLATION = '23503';

@Injectable({ providedIn: 'root' })
export class ExpensesStore {
  private readonly db = inject(Supabase).client;
  private readonly auth = inject(Auth);

  readonly today = signal(todayIso());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly settings = signal<PaySettings>(DEFAULT_SETTINGS);
  readonly mainAccount = signal<MainAccount>(DEFAULT_MAIN_ACCOUNT);
  readonly templates = signal<RecurringTemplate[]>([]);
  readonly operations = signal<Operation[]>([]);
  readonly overrides = signal<Override[]>([]);
  /** Tous les comptes secondaires, archivés compris (pour nommer les anciennes opérations). */
  readonly accounts = signal<Account[]>([]);
  readonly activeAccounts = computed(() => this.accounts().filter((a) => !a.archived));

  private readonly overrideMap = computed(
    () => new Map(this.overrides().map((o) => [overrideKey(o.templateId, o.dueDate), o])),
  );

  /** Période courante en premier, puis les précédentes. */
  readonly periods = computed(() => recentPeriods(this.settings(), this.today(), PERIOD_COUNT));
  readonly summaries = computed(() =>
    this.periods().map((p) => summarize(p, this.templates(), this.overrideMap(), this.operations(), this.today())),
  );
  readonly current = computed(() => this.summaries()[0]);

  /** Indicateurs de la période courante partagés par le tableau de bord et la vue d'ensemble. */
  readonly currentStats = computed(() => {
    const s = this.current();
    const daysLeft = Math.max(1, daysBetween(this.today(), s.period.next));
    const usedPct = s.income ? Math.round((s.out / s.income) * 100) : 0;
    return {
      daysLeft,
      perDay: Math.max(0, s.rest) / daysLeft,
      usedPct,
      usedColor: usedPct > 100 ? '#C92A2A' : usedPct > 85 ? '#E67700' : '#3B5BDB',
    };
  });

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => (userId ? void this.load() : this.reset()));
    });
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    this.today.set(todayIso());
    try {
      const [settings, payMoves, templates, amounts, overrides, operations, accounts] = await Promise.all([
        this.db.from('expense_settings').select('pay_day, workday_rank, main_account_label, main_account_method').maybeSingle(),
        this.db.from('pay_date_overrides').select('month, pay_date'),
        this.db.from('recurring_templates').select('*').order('created_at'),
        this.db.from('recurring_amounts').select('template_id, from_date, amount').order('from_date'),
        this.db.from('recurring_overrides').select('template_id, due_date, amount'),
        this.db.from('operations').select('*').order('date', { ascending: false }),
        this.db.from('accounts').select(ACCOUNT_COLUMNS).order('created_at'),
      ]);
      for (const r of [settings, payMoves, templates, amounts, overrides, operations, accounts]) if (r.error) throw r.error;
      const moved = Object.fromEntries((payMoves.data as PayMoveRow[]).map((r) => [r.month, r.pay_date]));
      this.settings.set(settings.data
        ? { payDay: settings.data.pay_day, workdayRank: settings.data.workday_rank, moved }
        : { ...DEFAULT_SETTINGS, moved });
      this.mainAccount.set(settings.data
        ? { label: settings.data.main_account_label, defaultMethod: settings.data.main_account_method }
        : DEFAULT_MAIN_ACCOUNT);
      const changes = new Map<string, AmountChange[]>();
      for (const a of amounts.data as AmountRow[]) {
        const list = changes.get(a.template_id) ?? [];
        list.push({ fromDate: a.from_date, amount: Number(a.amount) });
        changes.set(a.template_id, list);
      }
      this.templates.set((templates.data as TemplateRow[]).map((r) => toTemplate(r, changes.get(r.id))));
      this.overrides.set((overrides.data as OverrideRow[]).map(toOverride));
      this.operations.set((operations.data as OperationRow[]).map(toOperation));
      this.accounts.set((accounts.data as AccountRow[]).map(toAccount));
    } catch (e) {
      this.error.set('Impossible de charger tes données. ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private reset() {
    this.settings.set(DEFAULT_SETTINGS);
    this.mainAccount.set(DEFAULT_MAIN_ACCOUNT);
    this.templates.set([]);
    this.operations.set([]);
    this.overrides.set([]);
    this.accounts.set([]);
  }

  async saveSettings(patch: Partial<Omit<PaySettings, 'moved'>>) {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    const { error } = await this.db.from('expense_settings').upsert({
      user_id: this.auth.user()!.id, pay_day: next.payDay, workday_rank: next.workdayRank,
      last_workday: next.workdayRank === 1, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  /** Reporte ponctuellement le salaire du mois `month` (YYYY-MM) ; null rétablit la date prévue. */
  async movePayDate(month: string, payDate: string | null) {
    const moved = { ...this.settings().moved };
    if (payDate) moved[month] = payDate;
    else delete moved[month];
    this.settings.update((s) => ({ ...s, moved }));
    const { error } = payDate
      ? await this.db.from('pay_date_overrides').upsert({ user_id: this.auth.user()!.id, month, pay_date: payDate })
      : await this.db.from('pay_date_overrides').delete().eq('month', month);
    if (error) throw error;
  }

  async saveMainAccount(patch: Partial<MainAccount>) {
    const next = { ...this.mainAccount(), ...patch };
    this.mainAccount.set(next);
    const { error } = await this.db.from('expense_settings').upsert({
      user_id: this.auth.user()!.id, main_account_label: next.label, main_account_method: next.defaultMethod,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async addTemplate(t: NewTemplate) {
    const { data, error } = await this.db
      .from('recurring_templates')
      .insert({
        kind: t.kind, label: t.label, amount: t.amount, every: t.every, day: t.day, start_month: t.startMonth,
        method: t.method, category: t.category, on_payday: t.onPayday,
      })
      .select()
      .single();
    if (error) throw error;
    this.templates.update((l) => [...l, toTemplate(data as TemplateRow)]);
  }

  /** Change le montant à partir d'une date ; les échéances antérieures gardent leur montant. */
  async setTemplateAmount(id: string, fromDate: string, amount: number) {
    const { error } = await this.db.from('recurring_amounts').upsert({ template_id: id, from_date: fromDate, amount });
    if (error) throw error;
    this.patchTemplate(id, (t) => ({
      amounts: [...t.amounts.filter((c) => c.fromDate !== fromDate), { fromDate, amount }].sort((a, b) => a.fromDate.localeCompare(b.fromDate)),
    }));
  }

  /** Arrête un modèle : plus d'échéance après `endDate`, l'historique reste. */
  async stopTemplate(id: string, endDate: string) {
    const { error } = await this.db.from('recurring_templates').update({ end_date: endDate }).eq('id', id);
    if (error) throw error;
    this.patchTemplate(id, () => ({ endDate }));
  }

  private patchTemplate(id: string, patch: (t: RecurringTemplate) => Partial<RecurringTemplate>) {
    this.templates.update((l) => l.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)));
  }

  /** Suppression définitive (erreur de saisie) : le modèle disparaît aussi des périodes passées. */
  async removeTemplate(id: string) {
    const { error } = await this.db.from('recurring_templates').delete().eq('id', id);
    if (error) throw error;
    this.templates.update((l) => l.filter((t) => t.id !== id));
    this.overrides.update((l) => l.filter((o) => o.templateId !== id));
  }

  /** Ajuste le montant d'une seule occurrence ; le modèle n'est pas modifié. */
  async setOverride(templateId: string, dueDate: string, amount: number) {
    const { error } = await this.db
      .from('recurring_overrides')
      .upsert({ template_id: templateId, due_date: dueDate, amount });
    if (error) throw error;
    this.overrides.update((l) => [...l.filter((o) => !(o.templateId === templateId && o.dueDate === dueDate)), { templateId, dueDate, amount }]);
  }

  async saveOperation(input: OperationInput, id?: string) {
    const { accountId, ...rest } = input;
    const row = { ...rest, account_id: accountId };
    const query = id
      ? this.db.from('operations').update(row).eq('id', id).select().single()
      : this.db.from('operations').insert(row).select().single();
    const { data, error } = await query;
    if (error) throw error;
    const saved = toOperation(data as OperationRow);
    this.operations.update((l) => (id ? l.map((x) => (x.id === id ? saved : x)) : [saved, ...l]));
  }

  async removeOperation(id: string) {
    const { error } = await this.db.from('operations').delete().eq('id', id);
    if (error) throw error;
    this.operations.update((l) => l.filter((x) => x.id !== id));
  }

  /** Nom affiché du compte d'une opération ; null = compte principal. */
  accountLabel(id: string | null): string {
    if (id == null) return this.mainAccount().label ?? MAIN_ACCOUNT_LABEL;
    const a = this.accounts().find((x) => x.id === id);
    return a ? (a.archived ? `${a.label} (archivé)` : a.label) : 'Compte inconnu';
  }

  /** Moyen imposé par le type du compte, s'il y en a un. */
  fixedMethod(id: string | null): string | undefined {
    const a = id == null ? undefined : this.accounts().find((x) => x.id === id);
    return a && FIXED_METHODS[a.kind];
  }

  /** Moyen proposé à la saisie d'une opération sur ce compte. */
  defaultMethod(id: string | null): string {
    if (id == null) return this.mainAccount().defaultMethod;
    return this.fixedMethod(id) ?? this.accounts().find((x) => x.id === id)?.defaultMethod ?? this.mainAccount().defaultMethod;
  }

  /** Nombre d'opérations liées à un compte. */
  accountUsage(id: string): number {
    return this.operations().filter((o) => o.accountId === id).length;
  }

  async addAccount(input: AccountInput) {
    const { data, error } = await this.db.from('accounts')
      .insert({ label: input.label, kind: input.kind, default_method: input.defaultMethod })
      .select(ACCOUNT_COLUMNS).single();
    if (error) throw error;
    this.accounts.update((l) => [...l, toAccount(data as AccountRow)]);
  }

  async updateAccount(id: string, patch: Partial<AccountInput>) {
    const { error } = await this.db.from('accounts')
      .update({ label: patch.label, kind: patch.kind, default_method: patch.defaultMethod }).eq('id', id);
    if (error) throw error;
    this.patchAccount(id, patch);
  }

  /**
   * Supprime un compte s'il n'a aucune opération, sinon l'archive pour garder l'origine des dépenses.
   * Retourne `true` si le compte a été archivé plutôt que supprimé.
   */
  async removeAccount(id: string): Promise<boolean> {
    if (this.accountUsage(id) === 0) {
      const { error } = await this.db.from('accounts').delete().eq('id', id);
      if (!error) {
        this.accounts.update((l) => l.filter((a) => a.id !== id));
        return false;
      }
      // Une opération a été liée ailleurs entre-temps : on archive.
      if (error.code !== FK_VIOLATION) throw error;
    }
    await this.setArchived(id, true);
    return true;
  }

  async restoreAccount(id: string) {
    await this.setArchived(id, false);
  }

  private async setArchived(id: string, archived: boolean) {
    const { error } = await this.db.from('accounts').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
    if (error) throw error;
    this.patchAccount(id, { archived });
  }

  private patchAccount(id: string, patch: Partial<Account>) {
    this.accounts.update((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
}
