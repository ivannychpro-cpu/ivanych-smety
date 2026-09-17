import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { Card, Empty, formatDate } from '../components/ui';
import { money, pct } from '../lib/money';
import { checkLimits, estimateTotals } from '../lib/calc';

/** Очередь согласований для руководителя: что утверждать и почему это попало сюда. */
export default function Approvals() {
  const { db, update, can, currentUser, toast } = useApp();
  const queue = db.estimates.filter((e) => e.status === 'onApproval');

  if (!can('estimate.approve')) return <Empty icon="🔒" title="Раздел недоступен" />;

  const decide = (id: string, ok: boolean) => {
    update((draft) => {
      const e = draft.estimates.find((x) => x.id === id);
      if (!e) return;
      e.status = ok ? 'approved' : 'rejected';
      e.approval = { ...(e.approval ?? {}), approvedBy: currentUser!.id, approvedAt: new Date().toISOString() };
      e.updatedAt = new Date().toISOString();
      if (ok) {
        const o = draft.objects.find((x) => x.id === e.objectId);
        if (o && (o.status === 'lead' || o.status === 'measured')) o.status = 'estimated';
      }
    }, { action: ok ? 'estimate.approve' : 'estimate.reject', entity: 'estimate', entityId: id });
    toast(ok ? 'Смета утверждена' : 'Смета отклонена', ok ? 'success' : 'error');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Согласования</h1>
          <p>Сметы, ожидающие вашего решения: {queue.length}</p>
        </div>
      </div>

      {queue.length === 0 ? (
        <Empty icon="✅" title="Очередь пуста" hint="Все сметы согласованы." />
      ) : queue.map((e) => {
        const t = estimateTotals(e);
        const author = db.users.find((u) => u.id === e.authorId);
        const object = db.objects.find((o) => o.id === e.objectId);
        const client = db.clients.find((c) => c.id === e.clientId);
        const problems = checkLimits(e, author?.limits);

        return (
          <Card
            key={e.id}
            className="mb-16"
            title={<h3>{e.number} · {e.title}</h3>}
            actions={
              <div className="flex gap-8">
                <Link className="btn sm" to={`/estimates/${e.id}`}>Открыть смету</Link>
                <button className="btn sm danger" onClick={() => decide(e.id, false)}>Отклонить</button>
                <button className="btn sm success" onClick={() => decide(e.id, true)}>Утвердить</button>
              </div>
            }
          >
            <div className="grid cols-4 mb-12">
              <div><span className="muted small">Автор</span><div className="strong">{author?.fullName ?? '—'}</div></div>
              <div><span className="muted small">Объект</span><div className="strong">{object?.title ?? '—'}</div><div className="xsmall muted">{client?.fullName}</div></div>
              <div><span className="muted small">Сумма</span><div className="strong" style={{ fontSize: 18 }}>{money(t.total)}</div></div>
              <div><span className="muted small">Маржа</span><div className="strong" style={{ fontSize: 18 }}>{money(t.margin)} <span className="muted small">{pct(t.marginPct)}</span></div></div>
            </div>
            <div className="small muted">
              Наценка {pct(e.markupPct)} · скидка {pct(e.discountPct)} · строк {e.lines.length} ·
              на согласовании с {formatDate(e.approval?.requestedAt)}
            </div>
            {problems.map((p) => <div key={p} className="note warn mt-8">{p}</div>)}
          </Card>
        );
      })}
    </>
  );
}
