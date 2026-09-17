import { useMemo, useState } from 'react';
import type { CatalogItem, ID, Room, WorkBundle } from '../domain/types';
import { useApp } from '../store/AppContext';
import { Modal, Tabs } from './ui';
import { money } from '../lib/money';
import { QTY_BASIS_SHORT, qtyFromBasis } from '../lib/geometry';
import { searchCatalog } from '../lib/estimateOps';

export default function WorkPicker({ rooms, activeRoomId, onAdd, onAddBundle, onClose }: {
  rooms: Room[];
  activeRoomId: ID | null;
  onAdd: (item: CatalogItem) => void;
  onAddBundle: (bundle: WorkBundle, includeOptional: boolean) => void;
  onClose: () => void;
}) {
  const { db } = useApp();
  const [tab, setTab] = useState<'catalog' | 'bundles'>('catalog');
  const [sectionId, setSectionId] = useState<ID>(db.sections[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [includeOptional, setIncludeOptional] = useState(true);
  const [added, setAdded] = useState<Record<string, number>>({});

  const room = rooms.find((r) => r.id === activeRoomId);
  const sections = useMemo(() => [...db.sections].sort((a, b) => a.order - b.order), [db.sections]);

  const items = useMemo(() => {
    if (query.trim()) return searchCatalog(db.catalog, query, 80);
    return db.catalog.filter((c) => c.sectionId === sectionId && c.active);
  }, [db.catalog, query, sectionId]);

  const handleAdd = (item: CatalogItem) => {
    onAdd(item);
    setAdded((a) => ({ ...a, [item.id]: (a[item.id] ?? 0) + 1 }));
  };

  const previewQty = (item: CatalogItem) => {
    const q = qtyFromBasis(item.qtyBasis, room, item.qtyFactor ?? 1);
    return q == null ? null : q;
  };

  return (
    <Modal
      size="xl"
      title={<>Добавить работы {room ? <span className="muted">· {room.name}</span> : <span className="muted">· общие работы</span>}</>}
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Готово</button>}
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'catalog', label: 'Прайс', count: db.catalog.filter((c) => c.active).length },
          { value: 'bundles', label: 'Наборы работ (подсказки)', count: db.bundles.length },
        ]}
      />

      {tab === 'catalog' && (
        <>
          <input
            autoFocus
            type="search"
            placeholder="Поиск по названию или коду: «штукатур», «07.03», «плитка»…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-12"
          />
          <div className="picker">
            {!query.trim() && (
              <div className="picker-sections">
                {sections.map((s) => (
                  <div
                    key={s.id}
                    className={`picker-section ${s.id === sectionId ? 'active' : ''}`}
                    onClick={() => setSectionId(s.id)}
                  >
                    <span className="muted-2 xsmall">{s.code}</span> {s.title}
                  </div>
                ))}
              </div>
            )}
            <div className="picker-items">
              {items.length === 0 && <div className="empty small">Ничего не найдено</div>}
              {items.map((item) => {
                const q = previewQty(item);
                const count = added[item.id];
                return (
                  <div key={item.id} className="picker-item" onClick={() => handleAdd(item)}>
                    <div className="t">
                      <b>{item.title}</b>
                      <span>
                        {item.code} · {item.unit} · {QTY_BASIS_SHORT[item.qtyBasis]}
                        {q != null && <> · объём {q} {item.unit}</>}
                      </span>
                    </div>
                    <div className="right nowrap">
                      <div className="strong mono">{money(item.price)}</div>
                      {q != null && <div className="xsmall muted">итого {money(item.price * q)}</div>}
                    </div>
                    <button className={`btn sm ${count ? 'success' : 'primary'}`}>
                      {count ? `✓ ${count}` : '+ Добавить'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'bundles' && (
        <>
          <div className="note mb-12">
            Набор — это цепочка работ, которые не делаются одна без другой.
            Нажмите на набор: все работы попадут в смету, объёмы посчитаются по габаритам помещения.
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={includeOptional} onChange={(e) => setIncludeOptional(e.target.checked)} />
            <span>Добавлять необязательные работы набора</span>
          </label>
          <div className="grid cols-2 mt-12">
            {db.bundles.map((b) => (
              <div key={b.id} className="bundle-card" onClick={() => onAddBundle(b, includeOptional)}>
                <b>{b.title}</b>
                {b.description && <div className="d">{b.description}</div>}
                <div className="chain">
                  {b.items.map((i) => {
                    const it = db.catalog.find((c) => c.code === i.code);
                    return it ? `${it.title}${i.optional ? ' (опц.)' : ''}` : i.code;
                  }).join(' → ')}
                </div>
                <div>{(b.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
