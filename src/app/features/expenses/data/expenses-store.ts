import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Auth } from '../../../core/auth';
import { Supabase } from '../../../core/supabase';
import { todayIso } from '../domain/format';
import { AmountChange, Operation, Override, PaySettings, RecurringTemplate } from '../domain/models';
import { daysBetween, overrideKey, recentPeriods, summarize } from '../domain/periods';

/** Nombre de périodes affichées (courante + précédentes) dans les listes et statistiques. */
export const PERIOD_COUNT = 4;

const DEFAULT_SETTINGS: PaySettings = { payDay: 28, lastWorkday: false };

// Lignes telles que renvoyées par Supabase (snake_case, numeric en nombre ou chaîne).
interface TemplateRow {
  id: string; kind: RecurringTemplate['kind']; label: string; amount: number | string; every: number;
  day: number | null; start_month: string; method: string; category: string | null; on_payday: boolean;
  end_date: string | null;
}
interface OperationRow {
  id: string; kind: Operation['kind']; date: string; label: string; category: string; method: string;
  amount: number | string; note: string | null;
}
interface OverrideRow { template_id: string; due_date: string; amount: number | string }
interface AmountRow { template_id: string; from_date: string; amount: number | string }

const toTemplate = (r: TemplateRow, amounts: AmountChange[] = []): RecurringTemplate => ({
  id: r.id, kind: r.kind, label: r.label, amount: Number(r.amount), amounts, every: r.every, day: r.day,
  startMonth: r.start_month, method: r.method, category: r.category, onPayday: r.on_payday, endDate: r.end_date,
});
const toOperation = (r: OperationRow): Operation => ({
  id: r.id, kind: r.kind, date: r.date, label: r.label, category: r.category, method: r.method,
  amount: Number(r.amount), note: r.note ?? '',
});
const toOverride = (r: OverrideRow): Override => ({ templateId: r.template_id, dueDate: r.due_date, amount: Number(r.amount) });

export type NewTemplate = Omit<RecurringTemplate, 'id' | 'amounts' | 'endDate'>;
export type OperationInput = Omit<Operation, 'id'>;

@Injectable({ providedIn: 'root' })
export class ExpensesStore {
  private readonly db = inject(Supabase).client;
  private readonly auth = inject(Auth);

  readonly today = signal(todayIso());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly settings = signal<PaySettings>(DEFAULT_SETTINGS);
  readonly templates = signal<RecurringTemplate[]>([]);
  readonly operations = signal<Operation[]>([]);
  readonly overrides = signal<Override[]>([]);

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
      const [settings, templates, amounts, overrides, operations] = await Promise.all([
        this.db.from('expense_settings').select('pay_day, last_workday').maybeSingle(),
        this.db.from('recurring_templates').select('*').order('created_at'),
        this.db.from('recurring_amounts').select('template_id, from_date, amount').order('from_date'),
        this.db.from('recurring_overrides').select('template_id, due_date, amount'),
        this.db.from('operations').select('*').order('date', { ascending: false }),
      ]);
      for (const r of [settings, templates, amounts, overrides, operations]) if (r.error) throw r.error;
      this.settings.set(settings.data ? { payDay: settings.data.pay_day, lastWorkday: settings.data.last_workday } : DEFAULT_SETTINGS);
      const changes = new Map<string, AmountChange[]>();
      for (const a of amounts.data as AmountRow[]) {
        const list = changes.get(a.template_id) ?? [];
        list.push({ fromDate: a.from_date, amount: Number(a.amount) });
        changes.set(a.template_id, list);
      }
      this.templates.set((templates.data as TemplateRow[]).map((r) => toTemplate(r, changes.get(r.id))));
      this.overrides.set((overrides.data as OverrideRow[]).map(toOverride));
      this.operations.set((operations.data as OperationRow[]).map(toOperation));
    } catch (e) {
      this.error.set('Impossible de charger tes données. ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private reset() {
    this.settings.set(DEFAULT_SETTINGS);
    this.templates.set([]);
    this.operations.set([]);
    this.overrides.set([]);
  }

  async saveSettings(patch: Partial<PaySettings>) {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    const { error } = await this.db
      .from('expense_settings')
      .upsert({ user_id: this.auth.user()!.id, pay_day: next.payDay, last_workday: next.lastWorkday, updated_at: new Date().toISOString() });
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
    const query = id
      ? this.db.from('operations').update(input).eq('id', id).select().single()
      : this.db.from('operations').insert(input).select().single();
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
}
