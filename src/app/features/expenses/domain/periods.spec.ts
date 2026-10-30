import { describe, expect, it } from 'vitest';
import { Override, PaySettings, RecurringTemplate } from './models';
import { amountAt, dueDayLabel, nextDue, occurrencesFor, offBudgetBreakdown, overrideKey, payInfo, periodFor, recentPeriods, summarize } from './periods';

const settings: PaySettings = { payDay: 28, workdayRank: null, moved: {} };
const workday = (rank: number, moved: Record<string, string> = {}): PaySettings => ({ payDay: 28, workdayRank: rank, moved });
const TODAY = '2026-10-24';

const tpl = (p: Partial<RecurringTemplate>): RecurringTemplate => ({
  id: 't', kind: 'charge', label: 'x', amount: 10, every: 1, day: 1, startMonth: '2026-01',
  method: 'Virement', category: 'logement', onPayday: false, amounts: [], endDate: null, ...p,
});

describe('periodFor', () => {
  it('va du jour de salaire à la veille du suivant et porte le nom du mois financé', () => {
    const p = periodFor(settings, TODAY);
    expect(p).toMatchObject({ start: '2026-09-28', end: '2026-10-27', next: '2026-10-28', name: 'octobre 2026', title: "Période d'octobre" });
  });

  it('bascule sur la période suivante le jour du salaire', () => {
    expect(periodFor(settings, '2026-10-28')).toMatchObject({ start: '2026-10-28', name: 'novembre 2026', title: 'Période de novembre' });
  });

  it('borne le jour au dernier jour du mois (salaire le 31)', () => {
    expect(periodFor({ ...settings, payDay: 31 }, '2026-03-01')).toMatchObject({ start: '2026-02-28', end: '2026-03-30' });
  });

  it('gère le dernier jour ouvrable', () => {
    // 31/10/2026 est un samedi → vendredi 30
    expect(periodFor(workday(1), '2026-10-30').start).toBe('2026-10-30');
  });

  it('gère le N-ième jour ouvrable avant la fin du mois', () => {
    // avant-dernier : jeu. 29/10 (31 = sam.), ven. 27/11 (30 = lun.), mer. 30/12 (31 = jeu.)
    const starts = ['2026-10-29', '2026-11-27', '2026-12-30'].map((d) => periodFor(workday(2), d).start);
    expect(starts).toEqual(['2026-10-29', '2026-11-27', '2026-12-30']);
    expect(periodFor(workday(2), '2026-10-28')).toMatchObject({ start: '2026-09-29', end: '2026-10-28', next: '2026-10-29' });
    // 3e avant la fin de février 2027 (dim. 28) : ven. 26, jeu. 25, mer. 24
    expect(periodFor(workday(3), '2027-02-24').start).toBe('2027-02-24');
  });

  it('passe correctement de décembre à janvier', () => {
    expect(periodFor(settings, '2027-01-05')).toMatchObject({ start: '2026-12-28', next: '2027-01-28', name: 'janvier 2027' });
  });
});

describe('report ponctuel du salaire', () => {
  it('avance un salaire : la période précédente raccourcit, la suivante commence plus tôt', () => {
    const s = workday(2, { '2026-12': '2026-12-23' });
    expect(periodFor(s, '2026-12-24')).toMatchObject({ start: '2026-12-23', payMonth: '2026-12', name: 'janvier 2027' });
    expect(periodFor(s, '2026-12-01')).toMatchObject({ start: '2026-11-27', end: '2026-12-22', next: '2026-12-23' });
    expect(periodFor(s, '2027-01-20').start).toBe('2026-12-23');
  });

  it('retarde un salaire jusque dans le mois suivant', () => {
    const s = workday(2, { '2026-10': '2026-11-02' });
    expect(periodFor(s, '2026-11-01')).toMatchObject({ start: '2026-09-29', end: '2026-11-01', name: 'octobre 2026' });
    expect(periodFor(s, '2026-11-02')).toMatchObject({ start: '2026-11-02', end: '2026-11-26', name: 'novembre 2026' });
  });

  it('ne touche que le mois concerné et date le revenu au jour réel', () => {
    const s = workday(2, { '2026-12': '2026-12-23' });
    expect(recentPeriods(s, '2027-01-10', 3).map((p) => p.start)).toEqual(['2026-12-23', '2026-11-27', '2026-10-29']);
    const sal = tpl({ id: 'sal', kind: 'income', day: null, onPayday: true });
    expect(occurrencesFor(periodFor(s, '2027-01-10'), [sal], new Map(), TODAY)[0].due).toBe('2026-12-23');
  });

  it('borne un report entre le salaire précédent et le suivant', () => {
    expect(payInfo(workday(2), '2026-11')).toMatchObject({ regular: '2026-11-27', actual: '2026-11-27', moved: false, min: '2026-10-30', max: '2026-12-29' });
    expect(payInfo(workday(2, { '2026-11': '2026-11-25' }), '2026-11')).toMatchObject({ actual: '2026-11-25', moved: true });
  });
});

describe('recentPeriods', () => {
  it('renvoie la période courante puis les précédentes', () => {
    expect(recentPeriods(settings, TODAY, 3).map((p) => p.start)).toEqual(['2026-09-28', '2026-08-28', '2026-07-28']);
  });
});

describe('occurrencesFor', () => {
  const p = periodFor(settings, TODAY);

  it('place une charge mensuelle à son jour et la marque à venir si besoin', () => {
    const occ = occurrencesFor(p, [tpl({ id: 'loyer', day: 1 }), tpl({ id: 'prox', day: 25 })], new Map(), TODAY);
    expect(occ.map((o) => [o.due, o.upcoming])).toEqual([['2026-10-01', false], ['2026-10-25', true]]);
  });

  it('respecte la fréquence et le premier mois', () => {
    const fromJan = tpl({ id: 'a', every: 3, day: 26, startMonth: '2026-01' }); // janv., avr., juil., oct.
    const fromFeb = tpl({ id: 'b', every: 3, day: 26, startMonth: '2026-02' }); // févr., mai, août, nov.
    const late = tpl({ id: 'c', every: 1, day: 5, startMonth: '2026-11' });
    expect(occurrencesFor(p, [fromJan, fromFeb, late], new Map(), TODAY).map((o) => o.key)).toEqual(['a:2026-10-26']);
  });

  it('date un revenu au jour du salaire', () => {
    const occ = occurrencesFor(p, [tpl({ id: 'sal', kind: 'income', day: null, onPayday: true, amount: 2650 })], new Map(), TODAY);
    expect(occ).toHaveLength(1);
    expect(occ[0].due).toBe('2026-09-28');
  });

  it('applique un montant ajusté', () => {
    const t = tpl({ id: 'sal', kind: 'income', day: null, onPayday: true, amount: 2650 });
    const ov: Override = { templateId: 'sal', dueDate: '2026-09-28', amount: 2700 };
    const [o] = occurrencesFor(p, [t], new Map([[overrideKey('sal', '2026-09-28'), ov]]), TODAY);
    expect(o).toMatchObject({ amount: 2700, edited: true });
  });
});

describe('historique des modèles', () => {
  const p = periodFor(settings, TODAY);
  const prev = recentPeriods(settings, TODAY, 2)[1];
  const loyer = tpl({ id: 'loyer', day: 1, amount: 900, amounts: [{ fromDate: '2026-09-28', amount: 950 }] });

  it('applique un changement de montant à partir de sa date d’effet seulement', () => {
    expect(occurrencesFor(prev, [loyer], new Map(), TODAY)[0].amount).toBe(900);
    expect(occurrencesFor(p, [loyer], new Map(), TODAY)[0].amount).toBe(950);
  });

  it('prend le dernier changement en vigueur', () => {
    const t = tpl({ amount: 10, amounts: [{ fromDate: '2026-03-01', amount: 20 }, { fromDate: '2026-06-01', amount: 30 }] });
    expect([amountAt(t, '2026-02-01'), amountAt(t, '2026-03-01'), amountAt(t, '2026-05-31'), amountAt(t, '2027-01-01')]).toEqual([10, 20, 20, 30]);
  });

  it('un ajustement ponctuel prime sur le montant versionné', () => {
    const ov: Override = { templateId: 'loyer', dueDate: '2026-10-01', amount: 0 };
    expect(occurrencesFor(p, [loyer], new Map([[overrideKey('loyer', '2026-10-01'), ov]]), TODAY)[0].amount).toBe(0);
  });

  it('un modèle arrêté garde ses échéances passées et perd les suivantes', () => {
    const stopped = [tpl({ id: 'a', day: 1, endDate: '2026-10-24' }), tpl({ id: 'b', day: 25, endDate: '2026-10-24' })];
    expect(occurrencesFor(p, stopped, new Map(), TODAY).map((o) => o.key)).toEqual(['a:2026-10-01']);
    expect(occurrencesFor(prev, stopped, new Map(), TODAY)).toHaveLength(2);
    expect(nextDue(stopped[1], p, TODAY)).toBeNull();
  });
});

describe('summarize', () => {
  it('calcule revenus, charges, variables et reste', () => {
    const p = periodFor(settings, TODAY);
    const s = summarize(
      p,
      [tpl({ id: 'sal', kind: 'income', day: null, onPayday: true, amount: 2000 }), tpl({ id: 'loyer', day: 1, amount: 900 }), tpl({ id: 'prox', day: 25, amount: 60 })],
      new Map(),
      [
        { id: '1', kind: 'expense', date: '2026-10-10', label: 'Delhaize', category: 'alim', method: 'Bancontact', amount: 40, note: '', accountId: null },
        { id: '2', kind: 'income', date: '2026-10-11', label: 'Vente', category: 'vente', method: 'Virement', amount: 100, note: '', accountId: null },
        { id: '3', kind: 'expense', date: '2026-09-01', label: 'Hors période', category: 'alim', method: 'Bancontact', amount: 999, note: '', accountId: null },
      ],
      TODAY,
    );
    expect(s).toMatchObject({ income: 2100, extraTotal: 100, chargesTotal: 960, varTotal: 40, due: 60, out: 1000, rest: 1100 });
  });

  it('exclut du reste les opérations payées depuis un compte secondaire', () => {
    const p = periodFor(settings, TODAY);
    const s = summarize(
      p,
      [tpl({ id: 'sal', kind: 'income', day: null, onPayday: true, amount: 2000 })],
      new Map(),
      [
        { id: '1', kind: 'expense', date: '2026-10-10', label: 'Delhaize', category: 'alim', method: 'Bancontact', amount: 40, note: '', accountId: null },
        { id: '2', kind: 'expense', date: '2026-10-12', label: 'Garage', category: 'transport', method: 'Bancontact', amount: 300, note: '', accountId: 'epargne' },
      ],
      TODAY,
    );
    expect(s).toMatchObject({ varTotal: 40, rest: 1960, offBudgetTotal: 300 });
    expect(s.variables.map((x) => x.id)).toEqual(['1']);
    expect(s.offBudget.map((x) => x.id)).toEqual(['2']);
  });
});

describe('offBudgetBreakdown', () => {
  it('regroupe les dépenses hors budget par compte puis catégorie, sans les rechargements', () => {
    const p = periodFor(settings, TODAY);
    const op = (id: string, kind: 'expense' | 'income', category: string, amount: number, accountId: string | null) =>
      ({ id, kind, date: '2026-10-12', label: id, category, method: 'Bancontact', amount, note: '', accountId });
    const s = summarize(p, [], new Map(), [
      op('1', 'expense', 'alim', 40, null),
      op('2', 'expense', 'transport', 300, 'epargne'),
      op('3', 'expense', 'alim', 100, 'epargne'),
      op('4', 'expense', 'alim', 100, 'commun'),
      op('5', 'income', 'vente', 500, 'epargne'),
    ], TODAY);
    const r = offBudgetBreakdown(s);
    expect(r.map((x) => [x.accountId, x.total, x.pct])).toEqual([['epargne', 400, 80], ['commun', 100, 20]]);
    expect(r[0].categories.map((c) => c.pct)).toEqual([60, 20]);
    expect(r[1].categories.map((c) => c.pct)).toEqual([20]);
  });
});

describe('nextDue / dueDayLabel', () => {
  it('trouve la prochaine échéance annuelle', () => {
    const p = periodFor(settings, TODAY);
    expect(nextDue(tpl({ every: 12, day: 10, startMonth: '2026-03' }), p, TODAY)).toBe('2027-03-10');
  });

  it('décrit les mois d’une charge trimestrielle', () => {
    expect(dueDayLabel(tpl({ every: 3, day: 26, startMonth: '2026-01' }))).toBe('Le 26 · janv., avr., juil., oct.');
  });
});
