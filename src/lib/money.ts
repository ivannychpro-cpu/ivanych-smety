const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «1 234 567 ₽» */
export function money(v: number): string {
  if (!isFinite(v)) return '—';
  return `${nf0.format(Math.round(v))} ₽`;
}

/** Без символа валюты, с копейками. */
export function money2(v: number): string {
  if (!isFinite(v)) return '—';
  return nf2.format(v);
}

export function num(v: number, digits = 2): string {
  if (!isFinite(v)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(v);
}

export function pct(v: number, digits = 1): string {
  if (!isFinite(v)) return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(v)}%`;
}

export function parseNum(input: string): number {
  const cleaned = input.replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const v = Number(cleaned);
  return isFinite(v) ? v : 0;
}

const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triadToWords(n: number, female: boolean): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) out.push(HUNDREDS[h]);
  if (t === 1) out.push(TEENS[o]);
  else {
    if (t) out.push(TENS[t]);
    if (o) out.push(female ? ONES_F[o] : ONES[o]);
  }
  return out;
}

function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

/** Сумма прописью для договоров и актов. */
export function moneyInWords(value: number): string {
  const rub = Math.floor(Math.abs(value));
  const kop = Math.round((Math.abs(value) - rub) * 100);
  if (rub === 0) return `Ноль рублей ${String(kop).padStart(2, '0')} копеек`;

  const groups: { value: number; female: boolean; forms: [string, string, string] }[] = [
    { value: Math.floor(rub / 1_000_000_000) % 1000, female: false, forms: ['миллиард', 'миллиарда', 'миллиардов'] },
    { value: Math.floor(rub / 1_000_000) % 1000, female: false, forms: ['миллион', 'миллиона', 'миллионов'] },
    { value: Math.floor(rub / 1000) % 1000, female: true, forms: ['тысяча', 'тысячи', 'тысяч'] },
    { value: rub % 1000, female: false, forms: ['рубль', 'рубля', 'рублей'] },
  ];

  const words: string[] = [];
  for (const g of groups) {
    if (g.value === 0) {
      if (g.forms[0] === 'рубль') words.push(plural(rub % 1000, g.forms));
      continue;
    }
    words.push(...triadToWords(g.value, g.female), plural(g.value, g.forms));
  }
  const text = words.filter(Boolean).join(' ');
  const capped = text.charAt(0).toUpperCase() + text.slice(1);
  return `${capped} ${String(kop).padStart(2, '0')} ${plural(kop, ['копейка', 'копейки', 'копеек'])}`;
}
