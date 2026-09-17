import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Act, ID } from '../domain/types';
import { Badge, Card, Empty, Field, Modal, NumInput, Select, formatDate } from '../components/ui';
import { money, num } from '../lib/money';
import { lineTotals } from '../lib/calc';
import { ACT_TITLES } from '../lib/docs';
import { mkId, nextNumber } from '../lib/id';

/**
 * Акты формируются из сметы договора: отмечаем выполненные работы
 * и их объём — сумма и печатная форма считаются сами.
 */
export default function Acts() {
  const { db, can } = useApp();
  const [showNew, setShowNew] = useState(false);
  const list = useMemo(() => [...db.acts].sort((a, b) => b.date.localeCompare(a.date)), [db.acts]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Акты</h1>
          <p>Выполненных работ, дополнительных работ, скрытых работ и приёма-передачи.</p>
        </div>
        <div className="spacer" />
        {can('act.edit') && db.contracts.length > 0 && (
          <button className="btn primary" onClick={() => setShowNew(true)}>+ Акт</button>
        )}
      </div>

      {list.length === 0 ? (
        <Empty icon="✅" title="Актов пока нет" hint="Акт создаётся по договору на основании сметы." />
      ) : (
        <Card bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Номер</th><th>Вид</th><th>Договор</th><th>Клиент</th><th className="num">Позиций</th><th className="num">Сумма</th><th>Статус</th><th className="num">Дата</th><th /></tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const contract = db.contracts.find((c) => c.id === a.contractId);
                  const client = db.clients.find((c) => c.id === contract?.clientId);
                  return (
                    <tr key={a.id}>
                      <td className="strong">{a.number}</td>
                      <td className="small">{ACT_TITLES[a.kind]}</td>
                      <td className="small">{contract?.number ?? '—'}</td>
                      <td className="small">{client?.fullName ?? '—'}</td>
                      <td className="num">{a.lines.length}</td>
                      <td className="num strong">{money(a.amount)}</td>
                      <td><Badge kind={a.status === 'signed' ? 'green' : a.status === 'sent' ? 'blue' : undefined}>
                        {a.status === 'signed' ? 'подписан' : a.status === 'sent' ? 'отправлен' : 'черновик'}
                      </Badge></td>
                      <td className="num small muted">{formatDate(a.date)}</td>
                      <td className="right"><Link className="btn xs" to={`/documents/act/${a.id}`}>🖨</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showNew && <NewActDialog onClose={() => setShowNew(false)} />}
    </>
  );
}

function NewActDialog({ onClose }: { onClose: () => void }) {
  const { db, update, toast } = useApp();
  const [contractId, setContractId] = useState<ID>(db.contracts[0]?.id ?? '');
  const [kind, setKind] = useState<Act['kind']>('work');
  const [selected, setSelected] = useState<Record<ID, number>>({});   // id строки → процент выполнения

  const contract = db.contracts.find((c) => c.id === contractId);
  const estimate = db.estimates.find((e) => e.id === contract?.estimateId);
  const object = db.objects.find((o) => o.id === contract?.objectId);

  const lines = estimate?.lines ?? [];
  const alreadyByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of db.acts.filter((a) => a.contractId === contractId)) {
      for (const l of a.lines) map.set(l.code, (map.get(l.code) ?? 0) + l.qty);
    }
    return map;
  }, [db.acts, contractId]);

  const total = lines.reduce((s, l) => {
    const share = selected[l.id];
    if (!share) return s;
    return s + lineTotals(l, estimate!).unitPrice * l.qty * (share / 100);
  }, 0);

  const create = () => {
    if (!contract || !estimate) return;
    const actLines = lines
      .filter((l) => selected[l.id])
      .map((l) => ({
        id: mkId('al-'),
        code: l.code,
        title: l.title,
        unit: l.unit,
        qty: Math.round(l.qty * (selected[l.id] / 100) * 100) / 100,
        price: lineTotals(l, estimate).unitPrice,
      }));
    if (actLines.length === 0) return;

    const amount = Math.round(actLines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    update((draft) => {
      draft.acts.unshift({
        id: mkId('act-'),
        number: nextNumber(kind === 'extra' ? 'АДР' : 'АВР', draft.acts.map((a) => a.number)),
        kind,
        date: new Date().toISOString(),
        contractId: contract.id,
        estimateId: estimate.id,
        lines: actLines,
        amount,
        status: 'draft',
        createdAt: new Date().toISOString(),
      });
    }, { action: 'act.create', entity: 'act', entityId: contract.id, details: contract.number });
    toast('Акт создан', 'success');
    onClose();
  };

  const setAll = (pctValue: number) => {
    const next: Record<ID, number> = {};
    for (const l of lines) next[l.id] = pctValue;
    setSelected(next);
  };

  return (
    <Modal
      title="Новый акт"
      size="xl"
      onClose={onClose}
      footer={<>
        <div className="grow strong" style={{ marginRight: 'auto' }}>Сумма акта: {money(total)}</div>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={total <= 0} onClick={create}>Создать акт</button>
      </>}
    >
      <div className="grid cols-2">
        <Field label="Договор">
          <Select value={contractId} onChange={setContractId} options={db.contracts.map((c) => ({
            value: c.id, label: `${c.number} — ${db.clients.find((x) => x.id === c.clientId)?.fullName ?? ''}`,
          }))} />
        </Field>
        <Field label="Вид акта">
          <Select value={kind} onChange={setKind} options={Object.entries(ACT_TITLES).map(([k, v]) => ({ value: k as Act['kind'], label: v }))} />
        </Field>
      </div>

      {object && <div className="small muted mb-12">Объект: {object.title}, {object.address}</div>}

      {!estimate ? (
        <div className="note warn">К договору не привязана смета — состав работ нужно будет внести вручную.</div>
      ) : (
        <>
          <div className="flex gap-8 mb-12">
            <button className="btn sm" onClick={() => setAll(100)}>Отметить всё на 100%</button>
            <button className="btn sm" onClick={() => setAll(0)}>Снять всё</button>
          </div>
          <div className="table-wrap">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>Код</th><th>Работа</th>
                  <th className="num" style={{ width: 80 }}>По смете</th>
                  <th className="num" style={{ width: 80 }}>Закрыто</th>
                  <th className="num" style={{ width: 90 }}>В акт, %</th>
                  <th className="num" style={{ width: 100 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const t = lineTotals(l, estimate);
                  const done = alreadyByCode.get(l.code) ?? 0;
                  const share = selected[l.id] ?? 0;
                  return (
                    <tr key={l.id}>
                      <td className="code">{l.code}</td>
                      <td>{l.title}</td>
                      <td className="num">{num(l.qty)} {l.unit}</td>
                      <td className="num muted">{done ? num(done) : '—'}</td>
                      <td className="num">
                        <NumInput className="compact" value={share} onChange={(v) => setSelected((s) => ({ ...s, [l.id]: Math.max(0, Math.min(100, v)) }))} />
                      </td>
                      <td className="num strong">{share ? money(t.unitPrice * l.qty * (share / 100)) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
