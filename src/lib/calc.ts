import type { CatalogItem, Estimate, EstimateLine, Room } from '../domain/types';
import { round2 } from './geometry';

export interface LineTotals {
  markupPct: number;
  discountPct: number;
  /** Цена за единицу для клиента с учётом наценки и скидки. */
  unitPrice: number;
  /** Сумма по прайсу без наценки и скидки. */
  base: number;
  /** Сумма к оплате клиентом. */
  total: number;
  /** Себестоимость строки. */
  cost: number;
  margin: number;
}

export function lineTotals(line: EstimateLine, estimate: Pick<Estimate, 'markupPct' | 'discountPct'>): LineTotals {
  const markupPct = line.markupPct ?? estimate.markupPct ?? 0;
  const discountPct = line.discountPct ?? estimate.discountPct ?? 0;
  const unitPrice = round2(line.basePrice * (1 + markupPct / 100) * (1 - discountPct / 100));
  const qty = line.qty || 0;
  const total = round2(unitPrice * qty);
  const cost = round2(line.cost * qty);
  return {
    markupPct,
    discountPct,
    unitPrice,
    base: round2(line.basePrice * qty),
    total,
    cost,
    margin: round2(total - cost),
  };
}

export interface EstimateTotals {
  /** Сумма по прайсу (до наценки и скидки). */
  base: number;
  /** Сколько добавила наценка. */
  markupAmount: number;
  /** Сколько сняла скидка. */
  discountAmount: number;
  /** Итог для клиента (до округления). */
  subtotal: number;
  /** Итог для клиента после округления. */
  total: number;
  cost: number;
  margin: number;
  marginPct: number;
  linesCount: number;
  byKind: { work: number; material: number; service: number };
}

export function estimateTotals(estimate: Estimate): EstimateTotals {
  let base = 0;
  let afterMarkup = 0;
  let subtotal = 0;
  let cost = 0;
  const byKind = { work: 0, material: 0, service: 0 };

  for (const line of estimate.lines) {
    const t = lineTotals(line, estimate);
    base += t.base;
    afterMarkup += round2(line.basePrice * (1 + t.markupPct / 100) * (line.qty || 0));
    subtotal += t.total;
    cost += t.cost;
    byKind[line.kind] = round2((byKind[line.kind] ?? 0) + t.total);
  }

  base = round2(base);
  subtotal = round2(subtotal);
  cost = round2(cost);
  const total = estimate.roundTo > 0 ? Math.round(subtotal / estimate.roundTo) * estimate.roundTo : subtotal;
  const margin = round2(total - cost);

  return {
    base,
    markupAmount: round2(afterMarkup - base),
    discountAmount: round2(afterMarkup - subtotal),
    subtotal,
    total,
    cost,
    margin,
    marginPct: total > 0 ? round2((margin / total) * 100) : 0,
    linesCount: estimate.lines.length,
    byKind,
  };
}

/** Итоги в разрезе помещений. */
export function totalsByRoom(estimate: Estimate, rooms: Room[]): { room: Room | null; total: number; cost: number; lines: number }[] {
  const map = new Map<string, { total: number; cost: number; lines: number }>();
  for (const line of estimate.lines) {
    const key = line.roomId ?? '__common__';
    const t = lineTotals(line, estimate);
    const acc = map.get(key) ?? { total: 0, cost: 0, lines: 0 };
    acc.total = round2(acc.total + t.total);
    acc.cost = round2(acc.cost + t.cost);
    acc.lines += 1;
    map.set(key, acc);
  }
  const out: { room: Room | null; total: number; cost: number; lines: number }[] = [];
  for (const room of rooms) {
    const acc = map.get(room.id);
    if (acc) out.push({ room, ...acc });
  }
  const common = map.get('__common__');
  if (common) out.push({ room: null, ...common });
  return out;
}

/* ─────────────── Технологические подсказки ─────────────── */

export type HintLevel = 'required' | 'recommended';

export interface TechHint {
  level: HintLevel;
  /** Из-за какой работы возникла подсказка. */
  becauseCode: string;
  becauseTitle: string;
  /** Что предлагается добавить. */
  code: string;
  title: string;
  roomId: string | null;
}

/**
 * Проверяет технологические связки: штукатурка без маяков,
 * шпаклёвка без грунтовки и т.п. Подсказки считаются в рамках помещения.
 */
export function techHints(estimate: Estimate, catalog: CatalogItem[]): TechHint[] {
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const presentByRoom = new Map<string, Set<string>>();
  for (const line of estimate.lines) {
    const key = line.roomId ?? '__common__';
    if (!presentByRoom.has(key)) presentByRoom.set(key, new Set());
    presentByRoom.get(key)!.add(line.code);
  }

  const hints: TechHint[] = [];
  // Одна подсказка на связку «помещение + работа»: обязательная вытесняет рекомендательную.
  const seen = new Set<string>();

  const collect = (level: HintLevel) => {
    for (const line of estimate.lines) {
      const item = line.catalogItemId ? catalog.find((c) => c.id === line.catalogItemId) : byCode.get(line.code);
      if (!item) continue;
      const key = line.roomId ?? '__common__';
      const present = presentByRoom.get(key)!;

      for (const code of (level === 'required' ? item.requires : item.companions) ?? []) {
        if (present.has(code)) continue;
        const dedupe = `${key}|${code}`;
        if (seen.has(dedupe)) continue;
        const target = byCode.get(code);
        if (!target || !target.active) continue;
        seen.add(dedupe);
        hints.push({
          level,
          becauseCode: item.code,
          becauseTitle: item.title,
          code,
          title: target.title,
          roomId: line.roomId ?? null,
        });
      }
    }
  };

  collect('required');
  collect('recommended');
  return hints;
}

/** Проверка лимитов сотрудника по скидке и наценке. */
export function checkLimits(
  estimate: Estimate,
  limits: { maxDiscountPct?: number; minMarkupPct?: number; maxMarkupPct?: number } | undefined,
): string[] {
  if (!limits) return [];
  const problems: string[] = [];
  const maxLineDiscount = estimate.lines.reduce((m, l) => Math.max(m, l.discountPct ?? estimate.discountPct), estimate.discountPct);
  const minLineMarkup = estimate.lines.reduce((m, l) => Math.min(m, l.markupPct ?? estimate.markupPct), estimate.markupPct);

  if (limits.maxDiscountPct != null && maxLineDiscount > limits.maxDiscountPct)
    problems.push(`Скидка ${maxLineDiscount}% превышает ваш лимит ${limits.maxDiscountPct}% — потребуется согласование руководителя.`);
  if (limits.minMarkupPct != null && minLineMarkup < limits.minMarkupPct)
    problems.push(`Наценка ${minLineMarkup}% ниже минимальной ${limits.minMarkupPct}% — потребуется согласование.`);
  if (limits.maxMarkupPct != null && estimate.markupPct > limits.maxMarkupPct)
    problems.push(`Наценка ${estimate.markupPct}% выше максимальной ${limits.maxMarkupPct}%.`);
  return problems;
}
