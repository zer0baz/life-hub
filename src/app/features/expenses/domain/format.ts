const money = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

export function fmtMoney(x: number): string {
  return money.format(x);
}

export function fmtMinus(x: number): string {
  return '− ' + money.format(Math.abs(x));
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Accepte « 12,50 », « 1 250.00 »… Renvoie NaN si illisible. */
export function parseAmount(raw: string | number | null | undefined): number {
  return parseFloat(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
}

export function amountToInput(x: number): string {
  return String(x).replace('.', ',');
}

/** Date du jour au format YYYY-MM-DD, selon le fuseau de l'appareil. */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fmtLongDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(iso + 'T00:00:00Z'));
}
