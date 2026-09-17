import type { CatalogItem, Estimate, EstimateLine, ID, Room, SiteObject, WorkBundle } from '../domain/types';
import { qtyFromBasis } from './geometry';
import { mkId } from './id';

/** Создаёт строку сметы из позиции прайса, подставляя объём по геометрии помещения. */
export function lineFromCatalog(
  item: CatalogItem,
  room: Room | undefined,
  order: number,
  opts?: { factor?: number; bundleId?: ID | null; qty?: number },
): EstimateLine {
  const factor = (opts?.factor ?? 1) * (item.qtyFactor ?? 1);
  const auto = opts?.qty == null ? qtyFromBasis(item.qtyBasis, room, factor) : null;
  return {
    id: mkId('ln-'),
    roomId: room?.id ?? null,
    catalogItemId: item.id,
    code: item.code,
    title: item.title,
    unit: item.unit,
    kind: item.kind,
    qty: opts?.qty ?? auto ?? 0,
    qtyAuto: opts?.qty == null && auto != null,
    qtyBasis: item.qtyBasis,
    basePrice: item.price,
    cost: item.cost,
    bundleId: opts?.bundleId ?? null,
    order,
  };
}

export function nextOrder(estimate: Estimate): number {
  return estimate.lines.reduce((m, l) => Math.max(m, l.order), 0) + 1;
}

/** Добавляет позицию прайса в смету. Если строка уже есть в этом помещении — суммирует объём. */
export function addCatalogItem(
  estimate: Estimate,
  item: CatalogItem,
  room: Room | undefined,
  opts?: { factor?: number; bundleId?: ID | null; qty?: number; mergeExisting?: boolean },
): { added: boolean; merged: boolean } {
  const roomId = room?.id ?? null;
  const existing = estimate.lines.find((l) => l.roomId === roomId && l.code === item.code);
  if (existing && opts?.mergeExisting !== false) {
    if (opts?.qty != null) {
      existing.qty = Math.round((existing.qty + opts.qty) * 100) / 100;
      existing.qtyAuto = false;
    }
    return { added: false, merged: true };
  }
  estimate.lines.push(lineFromCatalog(item, room, nextOrder(estimate), opts));
  return { added: true, merged: false };
}

/** Добавляет технологический набор: все работы цепочки разом. */
export function addBundle(
  estimate: Estimate,
  bundle: WorkBundle,
  catalog: CatalogItem[],
  rooms: Room[],
  targetRoomId: ID | null,
  includeOptional: boolean,
): { added: number; skipped: string[] } {
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const targets: (Room | undefined)[] = targetRoomId
    ? [rooms.find((r) => r.id === targetRoomId)]
    : [undefined];

  let added = 0;
  const skipped: string[] = [];
  for (const room of targets) {
    for (const entry of bundle.items) {
      if (entry.optional && !includeOptional) continue;
      const item = byCode.get(entry.code);
      if (!item || !item.active) { skipped.push(entry.code); continue; }
      const res = addCatalogItem(estimate, item, room, { factor: entry.factor, bundleId: bundle.id });
      if (res.added) added += 1;
    }
  }
  return { added, skipped };
}

/** Пересчитывает автоматические объёмы после изменения габаритов помещений. */
export function recalcAutoQty(estimate: Estimate, rooms: Room[], catalog: CatalogItem[]): number {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  let changed = 0;
  for (const line of estimate.lines) {
    if (!line.qtyAuto || !line.roomId) continue;
    const room = roomById.get(line.roomId);
    const item = line.catalogItemId ? byId.get(line.catalogItemId) : undefined;
    const q = qtyFromBasis(line.qtyBasis, room, item?.qtyFactor ?? 1);
    if (q != null && q !== line.qty) { line.qty = q; changed += 1; }
  }
  return changed;
}

/** Обновляет цены строк из текущего прайса (после изменения прайса). */
export function refreshPrices(estimate: Estimate, catalog: CatalogItem[]): number {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  let changed = 0;
  for (const line of estimate.lines) {
    if (!line.catalogItemId) continue;
    const item = byId.get(line.catalogItemId);
    if (!item) continue;
    if (line.basePrice !== item.price || line.cost !== item.cost) {
      line.basePrice = item.price;
      line.cost = item.cost;
      changed += 1;
    }
  }
  return changed;
}

export function emptyEstimate(params: {
  number: string; objectId: ID; clientId: ID; authorId: ID; title: string; markupPct: number;
}): Estimate {
  const iso = new Date().toISOString();
  return {
    id: mkId('est-'),
    number: params.number,
    title: params.title,
    objectId: params.objectId,
    clientId: params.clientId,
    authorId: params.authorId,
    status: 'draft',
    markupPct: params.markupPct,
    discountPct: 0,
    roundTo: 100,
    lines: [],
    version: 1,
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Поиск по прайсу: по коду, названию и тегам, с простым ранжированием. */
export function searchCatalog(catalog: CatalogItem[], query: string, limit = 40): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { item: CatalogItem; score: number }[] = [];
  for (const item of catalog) {
    if (!item.active) continue;
    const hay = `${item.code} ${item.title} ${(item.tags ?? []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const idx = hay.indexOf(w);
      if (idx < 0) { score = -1; break; }
      score += idx === 0 ? 3 : idx < 12 ? 2 : 1;
    }
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}

export function objectRooms(obj: SiteObject | undefined): Room[] {
  return obj?.rooms ?? [];
}
