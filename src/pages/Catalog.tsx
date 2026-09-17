import { useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { CatalogItem, ID, QtyBasis, Unit } from '../domain/types';
import { Card, Confirm, Empty, Field, Modal, NumInput, Select, TextInput } from '../components/ui';
import { money } from '../lib/money';
import { QTY_BASIS_TITLES } from '../lib/geometry';
import { catalogToCSV, download, parseCatalogCSV } from '../lib/csv';
import { mkId } from '../lib/id';

const UNITS: Unit[] = ['м2', 'м.п.', 'шт', 'точка', 'компл', 'м3', 'час', 'смена', 'усл'];
const BASES = Object.keys(QTY_BASIS_TITLES) as QtyBasis[];

export default function Catalog() {
  const { db, update, can, toast } = useApp();
  const [sectionId, setSectionId] = useState<ID | 'all'>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [confirmDel, setConfirmDel] = useState<CatalogItem | null>(null);
  const [showImport, setShowImport] = useState(false);
  const canEdit = can('catalog.edit');
  const canCost = can('estimate.cost.view');

  const sections = useMemo(() => [...db.sections].sort((a, b) => a.order - b.order), [db.sections]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.catalog
      .filter((i) => sectionId === 'all' || i.sectionId === sectionId)
      .filter((i) => !q || `${i.code} ${i.title}`.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [db.catalog, sectionId, query]);

  const save = (item: CatalogItem) => {
    update((draft) => {
      const idx = draft.catalog.findIndex((c) => c.id === item.id);
      if (idx >= 0) draft.catalog[idx] = item;
      else draft.catalog.push(item);
    }, { action: 'catalog.save', entity: 'catalog', entityId: item.id, details: item.title });
    setEditing(null);
    toast('Позиция сохранена', 'success');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Прайс</h1>
          <p>{db.catalog.length} позиций в {sections.length} разделах. Цены и себестоимость — основа всех смет.</p>
        </div>
        <div className="spacer" />
        <div className="flex gap-8 wrap">
          <button className="btn" onClick={() => download('прайс-иваныч.csv', catalogToCSV(db.catalog, (id) => db.sections.find((s) => s.id === id)?.title ?? ''))}>
            ⬇ Выгрузить CSV
          </button>
          {canEdit && <button className="btn" onClick={() => setShowImport(true)}>⬆ Загрузить прайс</button>}
          {canEdit && (
            <button
              className="btn primary"
              onClick={() => setEditing({
                id: mkId('cat-'), sectionId: sections[0]?.id ?? '', code: '', title: '', unit: 'м2',
                kind: 'work', price: 0, cost: 0, qtyBasis: 'manual', qtyFactor: 1,
                companions: [], requires: [], active: true,
              })}
            >
              + Позиция
            </button>
          )}
        </div>
      </div>

      <Card bodyClass="tight">
        <div className="row mb-12">
          <div className="grow" style={{ minWidth: 220 }}>
            <input type="search" placeholder="Поиск по коду или названию…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select style={{ width: 280 }} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="all">Все разделы</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.title}</option>)}
          </select>
        </div>

        {items.length === 0 ? <Empty icon="📋" title="Ничего не найдено" /> : (
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Код</th>
                  <th>Наименование</th>
                  <th style={{ width: 60 }}>Ед.</th>
                  <th className="num" style={{ width: 100 }}>Цена</th>
                  {canCost && <th className="num" style={{ width: 110 }}>Себестоимость</th>}
                  {canCost && <th className="num" style={{ width: 80 }}>Маржа</th>}
                  <th style={{ width: 180 }}>Объём считается по</th>
                  {canEdit && <th style={{ width: 70 }} />}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} style={{ opacity: i.active ? 1 : .5 }}>
                    <td className="code">{i.code}</td>
                    <td>
                      {i.title}
                      {(i.requires ?? []).length > 0 && <span className="tag" title="Обязательные предшествующие работы">требует: {i.requires!.join(', ')}</span>}
                    </td>
                    <td className="small muted">{i.unit}</td>
                    <td className="num strong">{money(i.price)}</td>
                    {canCost && <td className="num muted">{money(i.cost)}</td>}
                    {canCost && <td className="num">{i.price > 0 ? `${Math.round(((i.price - i.cost) / i.price) * 100)}%` : '—'}</td>}
                    <td className="small muted">{QTY_BASIS_TITLES[i.qtyBasis]}</td>
                    {canEdit && (
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost xs" onClick={() => setEditing(i)}>✎</button>
                          <button className="btn ghost xs" onClick={() => setConfirmDel(i)}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ItemDialog
          item={editing}
          sections={sections.map((s) => ({ value: s.id, label: `${s.code} · ${s.title}` }))}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDel && (
        <Confirm
          title="Удалить позицию прайса?"
          message={`«${confirmDel.title}» будет удалена. В существующих сметах строки останутся.`}
          onConfirm={() => update((draft) => { draft.catalog = draft.catalog.filter((c) => c.id !== confirmDel.id); })}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
    </>
  );
}

function ItemDialog({ item, sections, onSave, onClose }: {
  item: CatalogItem; sections: { value: string; label: string }[];
  onSave: (i: CatalogItem) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<CatalogItem>(item);
  const set = (p: Partial<CatalogItem>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <Modal
      title={item.title ? 'Позиция прайса' : 'Новая позиция'}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!draft.title} onClick={() => onSave(draft)}>Сохранить</button>
      </>}
    >
      <div className="grid cols-2">
        <Field label="Раздел">
          <Select value={draft.sectionId} onChange={(v) => set({ sectionId: v })} options={sections} />
        </Field>
        <Field label="Код (артикул)"><TextInput value={draft.code} onChange={(v) => set({ code: v })} placeholder="07.03" /></Field>
      </div>
      <Field label="Наименование"><TextInput value={draft.title} onChange={(v) => set({ title: v })} /></Field>
      <div className="grid cols-3">
        <Field label="Единица">
          <Select value={draft.unit} onChange={(v) => set({ unit: v })} options={UNITS.map((u) => ({ value: u, label: u }))} />
        </Field>
        <Field label="Цена клиенту, ₽"><NumInput value={draft.price} onChange={(v) => set({ price: v })} /></Field>
        <Field label="Себестоимость, ₽" hint="оплата мастеру за единицу"><NumInput value={draft.cost} onChange={(v) => set({ cost: v })} /></Field>
      </div>
      <div className="grid cols-2">
        <Field label="Объём считается по" hint="подставляется автоматически из габаритов помещения">
          <Select value={draft.qtyBasis} onChange={(v) => set({ qtyBasis: v })} options={BASES.map((b) => ({ value: b, label: QTY_BASIS_TITLES[b] }))} />
        </Field>
        <Field label="Коэффициент к объёму" hint="например, 2 — если работа в два слоя">
          <NumInput value={draft.qtyFactor ?? 1} onChange={(v) => set({ qtyFactor: v })} />
        </Field>
      </div>
      <div className="grid cols-2">
        <Field label="Обязательные предшествующие работы" hint="коды через пробел: 07.02">
          <TextInput value={(draft.requires ?? []).join(' ')} onChange={(v) => set({ requires: v.split(/\s+/).filter(Boolean) })} />
        </Field>
        <Field label="Работы-спутники" hint="подсказка «обычно идёт вместе»">
          <TextInput value={(draft.companions ?? []).join(' ')} onChange={(v) => set({ companions: v.split(/\s+/).filter(Boolean) })} />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
        <span>Позиция активна (доступна для добавления в смету)</span>
      </label>
    </Modal>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const { update, toast } = useApp();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('append');
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parseCatalogCSV(text) : null), [text]);

  const apply = () => {
    if (!parsed || parsed.rows.length === 0) return;
    update((draft) => {
      if (mode === 'replace') { draft.catalog = []; draft.sections = []; }
      const sectionByTitle = new Map(draft.sections.map((s) => [s.title.toLowerCase(), s]));
      for (const row of parsed.rows) {
        let section = sectionByTitle.get(row.section.toLowerCase());
        if (!section) {
          section = {
            id: mkId('sec-'),
            code: String(draft.sections.length + 1).padStart(2, '0'),
            title: row.section,
            order: draft.sections.length,
          };
          draft.sections.push(section);
          sectionByTitle.set(row.section.toLowerCase(), section);
        }
        const existing = draft.catalog.find((c) => c.code === row.code && c.sectionId === section.id);
        const payload = {
          sectionId: section.id, code: row.code, title: row.title, unit: row.unit, kind: 'work' as const,
          price: row.price, cost: row.cost, qtyBasis: row.qtyBasis, qtyFactor: row.qtyFactor,
          companions: row.companions, requires: row.requires, active: true,
        };
        if (existing) Object.assign(existing, payload);
        else draft.catalog.push({ id: mkId('cat-'), ...payload });
      }
    }, { action: 'catalog.import', entity: 'catalog', entityId: 'bulk', details: `${parsed.rows.length} строк` });
    toast(`Загружено позиций: ${parsed.rows.length}`, 'success');
    onClose();
  };

  return (
    <Modal
      title="Загрузка прайса"
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!parsed || parsed.rows.length === 0} onClick={apply}>
          Загрузить {parsed ? `(${parsed.rows.length})` : ''}
        </button>
      </>}
    >
      <div className="note mb-12">
        Подойдёт CSV из Excel (Файл → Сохранить как → CSV). Нужны столбцы <b>Наименование</b> и <b>Цена</b>;
        если есть <b>Раздел</b>, <b>Код</b>, <b>Ед.изм.</b>, <b>Себестоимость</b>, <b>База расчёта</b> — они тоже будут прочитаны.
        Проще всего: выгрузите текущий прайс в CSV, замените строки и загрузите обратно.
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="mb-12"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setText(await f.text());
        }}
      />

      <Field label="…или вставьте таблицу текстом">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Раздел;Код;Наименование;Ед.изм.;Цена;Себестоимость" />
      </Field>

      <div className="btn-group mb-12">
        <button className={`btn ${mode === 'append' ? 'active' : ''}`} onClick={() => setMode('append')}>Дополнить прайс</button>
        <button className={`btn ${mode === 'replace' ? 'active' : ''}`} onClick={() => setMode('replace')}>Заменить прайс целиком</button>
      </div>

      {parsed && parsed.errors.length > 0 && parsed.errors.map((e) => <div key={e} className="note danger mb-8">{e}</div>)}
      {parsed && parsed.rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl compact">
            <thead><tr><th>Раздел</th><th>Код</th><th>Наименование</th><th>Ед.</th><th className="num">Цена</th><th className="num">Себест.</th></tr></thead>
            <tbody>
              {parsed.rows.slice(0, 12).map((r, i) => (
                <tr key={i}>
                  <td className="small">{r.section}</td><td className="code">{r.code}</td><td className="small">{r.title}</td>
                  <td className="small">{r.unit}</td><td className="num">{money(r.price)}</td><td className="num muted">{money(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.rows.length > 12 && <div className="xsmall muted mt-8">…и ещё {parsed.rows.length - 12} строк</div>}
        </div>
      )}
    </Modal>
  );
}
