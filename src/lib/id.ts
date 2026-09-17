let counter = 0;

/** Короткий уникальный идентификатор. */
export function mkId(prefix = ''): string {
  counter += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}

/** Номер документа вида «СМ-2026-0031». */
export function nextNumber(prefix: string, existing: string[]): string {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const n of existing) {
    const m = re.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}
