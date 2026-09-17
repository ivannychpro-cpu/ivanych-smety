import type { CatalogItem, QtyBasis, Unit } from '../domain/types';

/** Разбор CSV с учётом кавычек. Разделитель определяется автоматически (; или ,). */
export function parseCSV(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (ch === '\r') continue;
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCSV(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const UNITS: Unit[] = ['м2', 'м.п.', 'шт', 'точка', 'компл', 'м3', 'час', 'смена', 'усл'];
const BASES: QtyBasis[] = ['manual', 'floor', 'ceiling', 'walls', 'wallsGross', 'perimeter', 'slopes', 'openings', 'volume', 'rooms'];

export const CATALOG_CSV_HEADER = [
  'Раздел', 'Код', 'Наименование', 'Ед.изм.', 'Цена', 'Себестоимость', 'База расчёта', 'Коэффициент', 'Спутники', 'Обязательные',
];

export function catalogToCSV(items: CatalogItem[], sectionTitle: (id: string) => string): string {
  return toCSV([
    CATALOG_CSV_HEADER,
    ...items.map((i) => [
      sectionTitle(i.sectionId), i.code, i.title, i.unit, i.price, i.cost,
      i.qtyBasis, i.qtyFactor ?? 1, (i.companions ?? []).join(' '), (i.requires ?? []).join(' '),
    ]),
  ]);
}

export interface ParsedRow {
  section: string;
  code: string;
  title: string;
  unit: Unit;
  price: number;
  cost: number;
  qtyBasis: QtyBasis;
  qtyFactor: number;
  companions: string[];
  requires: string[];
}

/** Импорт прайса из CSV. Ожидается шапка, как в выгрузке; лишние столбцы игнорируются. */
export function parseCatalogCSV(text: string): { rows: ParsedRow[]; errors: string[] } {
  const table = parseCSV(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ['Файл пуст или не содержит строк данных'] };

  const headerCells = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = headerCells.findIndex((h) => h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const iSection = col('раздел', 'группа', 'категор');
  const iCode = col('код', 'артикул', '№');
  const iTitle = col('наименован', 'работа', 'название');
  const iUnit = col('ед');
  const iPrice = col('цена', 'стоимость');
  const iCost = col('себестоим', 'мастеру', 'закуп');
  const iBasis = col('база');
  const iFactor = col('коэф');
  const iComp = col('спутник');
  const iReq = col('обязат');

  if (iTitle < 0 || iPrice < 0) {
    return { rows: [], errors: ['Не найдены обязательные столбцы «Наименование» и «Цена»'] };
  }

  const numOf = (v: string) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '')) || 0;
  const rows: ParsedRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const title = (cells[iTitle] ?? '').trim();
    if (!title) continue;
    const unitRaw = (cells[iUnit] ?? 'шт').trim().toLowerCase().replace('м²', 'м2').replace('кв.м', 'м2').replace('п.м', 'м.п.');
    const unit = (UNITS.find((u) => u.toLowerCase() === unitRaw) ?? 'шт') as Unit;
    const basisRaw = (cells[iBasis] ?? '').trim();
    const qtyBasis = (BASES.includes(basisRaw as QtyBasis) ? basisRaw : 'manual') as QtyBasis;

    rows.push({
      section: (cells[iSection] ?? 'Импортированные работы').trim() || 'Импортированные работы',
      code: (cells[iCode] ?? '').trim() || String(r),
      title,
      unit,
      price: numOf(cells[iPrice]),
      cost: iCost >= 0 ? numOf(cells[iCost]) : 0,
      qtyBasis,
      qtyFactor: iFactor >= 0 ? (numOf(cells[iFactor]) || 1) : 1,
      companions: iComp >= 0 ? (cells[iComp] ?? '').split(/[\s,;]+/).filter(Boolean) : [],
      requires: iReq >= 0 ? (cells[iReq] ?? '').split(/[\s,;]+/).filter(Boolean) : [],
    });
  }

  if (rows.length === 0) errors.push('Не удалось прочитать ни одной строки');
  return { rows, errors };
}
