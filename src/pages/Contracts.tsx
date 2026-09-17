import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Contract } from '../domain/types';
import { Badge, Card, Empty, Field, Modal, NumInput, Select, TextInput, formatDate, toDateInput } from '../components/ui';
import { money } from '../lib/money';
import { mkId } from '../lib/id';

const STATUS: Record<Contract['status'], { label: string; kind?: 'blue' | 'green' | 'amber' | 'red' | 'purple' }> = {
  draft: { label: 'Черновик' },
  onApproval: { label: 'На согласовании', kind: 'amber' },
  signed: { label: 'Подписан', kind: 'blue' },
  inWork: { label: 'В работе', kind: 'green' },
  closed: { label: 'Закрыт', kind: 'purple' },
  cancelled: { label: 'Расторгнут', kind: 'red' },
};

export default function Contracts() {
  const { db, update, can, toast } = useApp();
  const [editing, setEditing] = useState<Contract | null>(null);
  const canEdit = can('contract.edit');

  const list = useMemo(() => [...db.contracts].sort((a, b) => b.date.localeCompare(a.date)), [db.contracts]);

  const togglePaid = (contractId: string, paymentId: string) => {
    update((draft) => {
      const p = draft.contracts.find((c) => c.id === contractId)?.payments.find((x) => x.id === paymentId);
      if (p) p.paidAt = p.paidAt ? null : new Date().toISOString();
    }, { action: 'contract.payment', entity: 'contract', entityId: contractId });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Договоры</h1>
          <p>Договор создаётся из утверждённой сметы — данные клиента и объекта переносятся автоматически.</p>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon="📑" title="Договоров пока нет" hint="Откройте утверждённую смету и нажмите «В договор»." />
      ) : list.map((c) => {
        const client = db.clients.find((x) => x.id === c.clientId);
        const object = db.objects.find((x) => x.id === c.objectId);
        const estimate = db.estimates.find((x) => x.id === c.estimateId);
        const acts = db.acts.filter((a) => a.contractId === c.id);
        const paid = c.payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
        const progress = c.amount > 0 ? (paid / c.amount) * 100 : 0;

        return (
          <Card
            key={c.id}
            className="mb-16"
            title={<div className="flex items-center gap-8" style={{ gap: 10 }}>
              <h3>{c.number}</h3>
              <Badge kind={STATUS[c.status].kind}>{STATUS[c.status].label}</Badge>
              <span className="muted small">от {formatDate(c.date)}</span>
            </div>}
            actions={
              <div className="flex gap-8 wrap">
                <Link className="btn sm" to={`/documents/contract/${c.id}`}>🖨 Печать</Link>
                {can('act.edit') && <Link className="btn sm" to="/acts">+ Акт</Link>}
                {canEdit && <button className="btn sm" onClick={() => setEditing(c)}>✎ Изменить</button>}
              </div>
            }
          >
            <div className="grid cols-4 mb-16">
              <div><span className="muted small">Клиент</span><div className="strong">{client?.fullName ?? '—'}</div><div className="xsmall muted">{client?.phone}</div></div>
              <div><span className="muted small">Объект</span><div className="strong">{object?.title ?? '—'}</div><div className="xsmall muted">{object?.address}</div></div>
              <div><span className="muted small">Смета-основание</span><div>{estimate ? <Link to={`/estimates/${estimate.id}`}>{estimate.number}</Link> : '—'}</div></div>
              <div><span className="muted small">Сумма договора</span><div className="strong" style={{ fontSize: 18 }}>{money(c.amount)}</div></div>
            </div>

            <div className="mb-12">
              <div className="flex justify-between small mb-8">
                <span className="muted">Оплачено {money(paid)} из {money(c.amount)}</span>
                <span className="strong">{Math.round(progress)}%</span>
              </div>
              <div className={`progress ${progress >= 100 ? 'green' : ''}`}><div style={{ width: `${Math.min(100, progress)}%` }} /></div>
            </div>

            <div className="table-wrap">
              <table className="tbl compact">
                <thead><tr><th>Этап оплаты</th><th className="num">Сумма</th><th className="num">Срок</th><th>Статус</th><th className="num">Оплачен</th></tr></thead>
                <tbody>
                  {c.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td className="num strong">{money(p.amount)}</td>
                      <td className="num small muted">{formatDate(p.dueDate)}</td>
                      <td>
                        {p.paidAt ? <Badge kind="green">оплачен</Badge>
                          : p.dueDate && p.dueDate < new Date().toISOString() ? <Badge kind="red">просрочен</Badge>
                            : <Badge kind="amber">ожидается</Badge>}
                      </td>
                      <td className="num">
                        {can('contract.edit') || can('act.edit')
                          ? <button className="btn xs" onClick={() => togglePaid(c.id, p.id)}>{p.paidAt ? 'Отменить' : 'Отметить оплату'}</button>
                          : <span className="small muted">{formatDate(p.paidAt)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {acts.length > 0 && (
              <div className="mt-12">
                <div className="muted small mb-8">Акты по договору</div>
                {acts.map((a) => (
                  <div key={a.id} className="flex justify-between items-center small" style={{ padding: '4px 0' }}>
                    <span><Link to={`/documents/act/${a.id}`}>{a.number}</Link> · {formatDate(a.date)}</span>
                    <span className="strong">{money(a.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {editing && (
        <ContractDialog
          contract={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            update((draft) => {
              const idx = draft.contracts.findIndex((x) => x.id === c.id);
              if (idx >= 0) draft.contracts[idx] = { ...c, updatedAt: new Date().toISOString() };
            }, { action: 'contract.save', entity: 'contract', entityId: c.id, details: c.number });
            setEditing(null);
            toast('Договор сохранён', 'success');
          }}
        />
      )}
    </>
  );
}

function ContractDialog({ contract, onSave, onClose }: {
  contract: Contract; onSave: (c: Contract) => void; onClose: () => void;
}) {
  const [d, setD] = useState<Contract>(contract);
  const set = (p: Partial<Contract>) => setD((x) => ({ ...x, ...p }));

  return (
    <Modal
      title={`Договор ${contract.number}`}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={() => onSave(d)}>Сохранить</button>
      </>}
    >
      <div className="grid cols-3">
        <Field label="Статус">
          <Select value={d.status} onChange={(v) => set({ status: v })}
            options={Object.entries(STATUS).map(([k, v]) => ({ value: k as Contract['status'], label: v.label }))} />
        </Field>
        <Field label="Дата начала работ">
          <input type="date" value={toDateInput(d.startDate)} onChange={(e) => set({ startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
        </Field>
        <Field label="Дата окончания работ">
          <input type="date" value={toDateInput(d.endDate)} onChange={(e) => set({ endDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
        </Field>
      </div>
      <div className="grid cols-3">
        <Field label="Сумма договора, ₽"><NumInput value={d.amount} onChange={(v) => set({ amount: v })} /></Field>
        <Field label="Аванс, %"><NumInput value={d.terms?.prepaymentPct ?? 0} onChange={(v) => set({ terms: { ...d.terms, prepaymentPct: v } })} /></Field>
        <Field label="Гарантия, мес."><NumInput value={d.terms?.warrantyMonths ?? 24} onChange={(v) => set({ terms: { ...d.terms, warrantyMonths: v } })} /></Field>
      </div>

      <h4 className="mt-16 mb-8">График платежей</h4>
      {d.payments.map((p, i) => (
        <div className="row mb-8" key={p.id}>
          <div className="grow">
            <TextInput className="compact" value={p.title}
              onChange={(v) => set({ payments: d.payments.map((x, k) => (k === i ? { ...x, title: v } : x)) })} />
          </div>
          <div style={{ width: 130 }}>
            <NumInput className="compact" value={p.amount}
              onChange={(v) => set({ payments: d.payments.map((x, k) => (k === i ? { ...x, amount: v } : x)) })} />
          </div>
          <div style={{ width: 150 }}>
            <input type="date" className="compact" value={toDateInput(p.dueDate)}
              onChange={(e) => set({ payments: d.payments.map((x, k) => (k === i ? { ...x, dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined } : x)) })} />
          </div>
          <button className="btn ghost sm" onClick={() => set({ payments: d.payments.filter((_, k) => k !== i) })}>✕</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => set({ payments: [...d.payments, { id: mkId('pay-'), title: 'Этап', amount: 0, paidAt: null }] })}>
        + Этап оплаты
      </button>
    </Modal>
  );
}
