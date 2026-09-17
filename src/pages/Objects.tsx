import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { SiteObject } from '../domain/types';
import { Badge, Card, Empty, Field, Modal, Select, TextInput, NumInput, formatDate } from '../components/ui';
import { money, num } from '../lib/money';
import { estimateTotals } from '../lib/calc';
import { totalGeometry } from '../lib/geometry';
import RoomsEditor from '../components/RoomsEditor';
import { recalcAutoQty } from '../lib/estimateOps';
import { mkId } from '../lib/id';
import { OBJECT_STATUS } from './Dashboard';

const STATUS_KIND: Record<SiteObject['status'], 'blue' | 'green' | 'amber' | 'red' | 'purple' | undefined> = {
  lead: 'amber', measured: 'blue', estimated: 'blue', contract: 'purple', inWork: 'green', done: undefined, lost: 'red',
};

export default function Objects() {
  const { db, update, can, toast } = useApp();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<SiteObject | null>(null);
  const [roomsFor, setRoomsFor] = useState<SiteObject | null>(null);
  const canEdit = can('object.edit');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.objects
      .filter((o) => {
        if (!q) return true;
        const client = db.clients.find((c) => c.id === o.clientId);
        return `${o.title} ${o.address} ${client?.fullName ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db.objects, db.clients, query]);

  const applyRooms = (objectId: string, rooms: SiteObject['rooms']) => {
    update((draft) => {
      const o = draft.objects.find((x) => x.id === objectId);
      if (!o) return;
      o.rooms = rooms;
      for (const e of draft.estimates.filter((e) => e.objectId === objectId && e.status === 'draft')) {
        recalcAutoQty(e, rooms, draft.catalog);
      }
    }, { action: 'object.rooms', entity: 'object', entityId: objectId });
    toast('Габариты сохранены, объёмы в черновиках пересчитаны', 'success');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Объекты</h1>
          <p>{db.objects.length} объектов. Габариты помещений — основа автоматического расчёта объёмов работ.</p>
        </div>
        <div className="spacer" />
        {canEdit && (
          <button
            className="btn primary"
            onClick={() => setEditing({
              id: mkId('obj-'), clientId: db.clients[0]?.id ?? '', title: '', address: '',
              area: 0, ceilingHeight: 2.7, rooms: [], status: 'lead', createdAt: new Date().toISOString(),
            })}
          >
            + Объект
          </button>
        )}
      </div>

      <Card bodyClass="tight">
        <input className="mb-12" type="search" placeholder="Поиск по названию, адресу, клиенту…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {list.length === 0 ? <Empty icon="🏗️" title="Объектов не найдено" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Объект</th><th>Клиент</th><th>Статус</th>
                  <th className="num">Помещений</th><th className="num">Пол / Стены, м²</th>
                  <th className="num">Смет</th><th className="num">Сумма</th><th>Ответственные</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {list.map((o) => {
                  const client = db.clients.find((c) => c.id === o.clientId);
                  const estimates = db.estimates.filter((e) => e.objectId === o.id);
                  const sum = estimates.reduce((s, e) => s + estimateTotals(e).total, 0);
                  const g = totalGeometry(o.rooms);
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="strong">{o.title}</div>
                        <div className="xsmall muted">{o.address}</div>
                      </td>
                      <td className="small">{client?.fullName ?? '—'}</td>
                      <td><Badge kind={STATUS_KIND[o.status]}>{OBJECT_STATUS[o.status]}</Badge></td>
                      <td className="num">{o.rooms.length}</td>
                      <td className="num small">{num(g.floor)} / {num(g.walls)}</td>
                      <td className="num">{estimates.length}</td>
                      <td className="num strong">{money(sum)}</td>
                      <td className="xsmall muted">
                        {o.measurerId && <div>замер: {db.users.find((u) => u.id === o.measurerId)?.fullName}</div>}
                        {o.foremanId && <div>прораб: {db.users.find((u) => u.id === o.foremanId)?.fullName}</div>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost xs" title="Габариты помещений" onClick={() => setRoomsFor(o)}>📐</button>
                          {canEdit && <button className="btn ghost xs" onClick={() => setEditing(o)}>✎</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {list.length > 0 && (
        <Card className="mt-16" title="Сметы по объектам" bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl compact">
              <thead><tr><th>Объект</th><th>Смета</th><th className="num">Сумма</th><th className="num">Создана</th></tr></thead>
              <tbody>
                {db.estimates.slice(0, 12).map((e) => (
                  <tr key={e.id}>
                    <td className="small">{db.objects.find((o) => o.id === e.objectId)?.title ?? '—'}</td>
                    <td><Link to={`/estimates/${e.id}`}>{e.number}</Link> <span className="muted small">{e.title}</span></td>
                    <td className="num strong">{money(estimateTotals(e).total)}</td>
                    <td className="num small muted">{formatDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <ObjectDialog
          object={editing}
          onClose={() => setEditing(null)}
          onSave={(o) => {
            update((draft) => {
              const idx = draft.objects.findIndex((x) => x.id === o.id);
              if (idx >= 0) draft.objects[idx] = o; else draft.objects.unshift(o);
            }, { action: 'object.save', entity: 'object', entityId: o.id, details: o.title });
            setEditing(null);
            toast('Объект сохранён', 'success');
          }}
        />
      )}

      {roomsFor && (
        <RoomsEditor
          rooms={db.objects.find((o) => o.id === roomsFor.id)?.rooms ?? []}
          objectTitle={roomsFor.title}
          onChange={(rooms) => applyRooms(roomsFor.id, rooms)}
          onClose={() => setRoomsFor(null)}
        />
      )}
    </>
  );
}

function ObjectDialog({ object, onSave, onClose }: { object: SiteObject; onSave: (o: SiteObject) => void; onClose: () => void }) {
  const { db } = useApp();
  const [d, setD] = useState<SiteObject>(object);
  const set = (p: Partial<SiteObject>) => setD((x) => ({ ...x, ...p }));
  const userOptions = (role: string) => [
    { value: '', label: '— не назначен —' },
    ...db.users.filter((u) => u.roleCode === role).map((u) => ({ value: u.id, label: u.fullName })),
  ];

  return (
    <Modal
      title={object.title || 'Новый объект'}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!d.title || !d.clientId} onClick={() => onSave(d)}>Сохранить</button>
      </>}
    >
      <div className="grid cols-2">
        <Field label="Клиент">
          <Select value={d.clientId} onChange={(v) => set({ clientId: v })} options={db.clients.map((c) => ({ value: c.id, label: c.fullName }))} />
        </Field>
        <Field label="Название объекта"><TextInput value={d.title} onChange={(v) => set({ title: v })} /></Field>
      </div>
      <Field label="Адрес"><TextInput value={d.address} onChange={(v) => set({ address: v })} /></Field>
      <div className="grid cols-3">
        <Field label="Площадь, м²"><NumInput value={d.area ?? 0} onChange={(v) => set({ area: v })} /></Field>
        <Field label="Высота потолков, м"><NumInput value={d.ceilingHeight ?? 0} onChange={(v) => set({ ceilingHeight: v })} /></Field>
        <Field label="Статус">
          <Select
            value={d.status}
            onChange={(v) => set({ status: v })}
            options={Object.entries(OBJECT_STATUS).map(([k, v]) => ({ value: k as SiteObject['status'], label: v }))}
          />
        </Field>
      </div>
      <div className="grid cols-3">
        <Field label="Замерщик">
          <Select value={d.measurerId ?? ''} onChange={(v) => set({ measurerId: v || undefined })} options={userOptions('measurer')} />
        </Field>
        <Field label="Дизайнер">
          <Select value={d.designerId ?? ''} onChange={(v) => set({ designerId: v || undefined })} options={userOptions('designer')} />
        </Field>
        <Field label="Прораб">
          <Select value={d.foremanId ?? ''} onChange={(v) => set({ foremanId: v || undefined })} options={userOptions('production')} />
        </Field>
      </div>
    </Modal>
  );
}
