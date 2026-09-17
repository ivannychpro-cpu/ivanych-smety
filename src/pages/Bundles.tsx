import { useState } from 'react';
import { useApp } from '../store/AppContext';
import type { StageCode, WorkBundle } from '../domain/types';
import { Card, Confirm, Field, Modal, Select, TextInput } from '../components/ui';
import { money } from '../lib/money';
import { mkId } from '../lib/id';

const STAGES: { value: StageCode; label: string }[] = [
  { value: 'demolition', label: 'Демонтаж' },
  { value: 'rough', label: 'Черновые работы' },
  { value: 'engineering', label: 'Инженерия' },
  { value: 'finishing', label: 'Чистовая отделка' },
  { value: 'final', label: 'Финальный этап' },
  { value: 'other', label: 'Прочее' },
];

/**
 * Наборы работ — подсказки для замерщика.
 * Здесь руководитель настраивает технологические цепочки под свою технологию работ.
 */
export default function Bundles() {
  const { db, update, can, toast } = useApp();
  const [editing, setEditing] = useState<WorkBundle | null>(null);
  const [confirmDel, setConfirmDel] = useState<WorkBundle | null>(null);
  const canEdit = can('catalog.edit');

  const priceOf = (b: WorkBundle) =>
    b.items.reduce((s, i) => s + (db.catalog.find((c) => c.code === i.code)?.price ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Наборы работ</h1>
          <p>Технологические цепочки: работы, которые не делаются одна без другой. Замерщик добавляет их одним нажатием.</p>
        </div>
        <div className="spacer" />
        {canEdit && (
          <button
            className="btn primary"
            onClick={() => setEditing({ id: mkId('bnd-'), title: '', description: '', stage: 'finishing', surface: 'walls', items: [], tags: [] })}
          >
            + Набор
          </button>
        )}
      </div>

      <div className="grid cols-2">
        {db.bundles.map((b) => (
          <Card
            key={b.id}
            title={b.title}
            actions={canEdit ? (
              <div className="flex gap-8">
                <button className="btn ghost xs" onClick={() => setEditing(b)}>✎</button>
                <button className="btn ghost xs" onClick={() => setConfirmDel(b)}>✕</button>
              </div>
            ) : undefined}
            bodyClass="tight"
          >
            {b.description && <p className="small muted">{b.description}</p>}
            <div className="table-wrap">
              <table className="tbl compact">
                <tbody>
                  {b.items.map((i, idx) => {
                    const item = db.catalog.find((c) => c.code === i.code);
                    return (
                      <tr key={`${i.code}-${idx}`}>
                        <td className="code" style={{ width: 54 }}>{idx + 1}.</td>
                        <td>
                          {item?.title ?? <span className="neg">код {i.code} не найден в прайсе</span>}
                          {i.optional && <span className="tag" style={{ marginLeft: 6 }}>опционально</span>}
                        </td>
                        <td className="num small muted" style={{ width: 90 }}>{item ? money(item.price) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-8 small muted">
              Сумма за единицу цепочки: <b>{money(priceOf(b))}</b>
              {' · '}{(b.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <BundleDialog
          bundle={editing}
          onClose={() => setEditing(null)}
          onSave={(b) => {
            update((draft) => {
              const idx = draft.bundles.findIndex((x) => x.id === b.id);
              if (idx >= 0) draft.bundles[idx] = b; else draft.bundles.push(b);
            }, { action: 'bundle.save', entity: 'bundle', entityId: b.id, details: b.title });
            setEditing(null);
            toast('Набор сохранён', 'success');
          }}
        />
      )}

      {confirmDel && (
        <Confirm
          title="Удалить набор?"
          message={`«${confirmDel.title}» больше не будет предлагаться замерщикам.`}
          onConfirm={() => update((draft) => { draft.bundles = draft.bundles.filter((b) => b.id !== confirmDel.id); })}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </>
  );
}

function BundleDialog({ bundle, onSave, onClose }: {
  bundle: WorkBundle; onSave: (b: WorkBundle) => void; onClose: () => void;
}) {
  const { db } = useApp();
  const [draft, setDraft] = useState<WorkBundle>(bundle);
  const [pick, setPick] = useState('');
  const set = (p: Partial<WorkBundle>) => setDraft((d) => ({ ...d, ...p }));

  const move = (idx: number, dir: -1 | 1) => {
    const items = [...draft.items];
    const to = idx + dir;
    if (to < 0 || to >= items.length) return;
    [items[idx], items[to]] = [items[to], items[idx]];
    set({ items });
  };

  return (
    <Modal
      title={bundle.title ? 'Набор работ' : 'Новый набор работ'}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!draft.title || draft.items.length === 0} onClick={() => onSave(draft)}>Сохранить</button>
      </>}
    >
      <Field label="Название набора"><TextInput value={draft.title} onChange={(v) => set({ title: v })} placeholder="Стены под покраску (финиш)" /></Field>
      <Field label="Пояснение для замерщика">
        <TextInput value={draft.description ?? ''} onChange={(v) => set({ description: v })} placeholder="Грунт → шпаклёвка → ошкуривание → покраска" />
      </Field>
      <div className="grid cols-2">
        <Field label="Этап">
          <Select value={draft.stage} onChange={(v) => set({ stage: v })} options={STAGES} />
        </Field>
        <Field label="Теги" hint="через пробел">
          <TextInput value={(draft.tags ?? []).join(' ')} onChange={(v) => set({ tags: v.split(/\s+/).filter(Boolean) })} />
        </Field>
      </div>

      <h4 className="mt-16 mb-8">Состав цепочки</h4>
      <div className="table-wrap mb-12">
        <table className="tbl compact">
          <tbody>
            {draft.items.map((i, idx) => {
              const item = db.catalog.find((c) => c.code === i.code);
              return (
                <tr key={`${i.code}-${idx}`}>
                  <td style={{ width: 40 }}>{idx + 1}.</td>
                  <td>{item?.title ?? i.code}</td>
                  <td style={{ width: 130 }}>
                    <label className="checkbox mb-0">
                      <input
                        type="checkbox"
                        checked={!!i.optional}
                        onChange={(e) => set({ items: draft.items.map((x, k) => (k === idx ? { ...x, optional: e.target.checked } : x)) })}
                      />
                      <span className="xsmall">опционально</span>
                    </label>
                  </td>
                  <td style={{ width: 96 }} className="right">
                    <button className="btn ghost xs" onClick={() => move(idx, -1)}>↑</button>
                    <button className="btn ghost xs" onClick={() => move(idx, 1)}>↓</button>
                    <button className="btn ghost xs" onClick={() => set({ items: draft.items.filter((_, k) => k !== idx) })}>✕</button>
                  </td>
                </tr>
              );
            })}
            {draft.items.length === 0 && <tr><td className="muted small center">Добавьте работы из прайса</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="row">
        <div className="grow">
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— выберите работу из прайса —</option>
            {[...db.catalog].sort((a, b) => a.code.localeCompare(b.code)).map((c) => (
              <option key={c.id} value={c.code}>{c.code} · {c.title} · {money(c.price)}/{c.unit}</option>
            ))}
          </select>
        </div>
        <button className="btn" disabled={!pick} onClick={() => { set({ items: [...draft.items, { code: pick }] }); setPick(''); }}>
          + В цепочку
        </button>
      </div>
    </Modal>
  );
}
