import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { computeMetrics, monthlySeries, userMetrics } from '../lib/analytics';
import { estimateTotals, lineTotals } from '../lib/calc';
import { money, num, pct } from '../lib/money';
import { Card, Empty, Kpi, Tabs, formatDate } from '../components/ui';
import { roleTitle } from '../domain/permissions';

/**
 * Управленческий блок: деньги, воронка, люди, объекты и работы.
 * Состав показателей зависит от прав: финансы и ФОТ видят не все.
 */
export default function Management() {
  const { db, can } = useApp();
  const [tab, setTab] = useState<'summary' | 'objects' | 'people' | 'works' | 'money'>('summary');
  const metrics = useMemo(() => computeMetrics(db), [db]);
  const series = useMemo(() => monthlySeries(db, 6), [db]);

  if (!can('management.view')) return <Empty icon="🔒" title="Раздел недоступен" hint="Нужны права на управленческие отчёты." />;

  const canFinance = can('management.finance');
  const maxSum = Math.max(1, ...series.map((s) => s.sum));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Управленческий блок</h1>
          <p>Показатели компании на {new Date().toLocaleDateString('ru-RU')}. Данные считаются из смет, договоров и задач.</p>
        </div>
      </div>

      <div className="grid cols-4 mb-16">
        <Kpi label="Портфель договоров" value={money(metrics.contractsSum)} hint={`${metrics.contractsActive} активных договоров`} />
        <Kpi label="Сметы в работе" value={money(metrics.estimatesSum)} hint={`${metrics.estimatesTotal} смет, ${metrics.estimatesOnApproval} на согласовании`} />
        {canFinance && <Kpi label="Маржа портфеля" value={money(metrics.marginSum)} hint={pct(metrics.marginPct)} tone={metrics.marginPct >= 25 ? 'green' : 'amber'} />}
        {canFinance && <Kpi label="Дебиторка" value={money(metrics.receivable)} hint={metrics.overdueSum > 0 ? `просрочено ${money(metrics.overdueSum)}` : 'без просрочки'} tone={metrics.overdueSum > 0 ? 'red' : 'green'} />}
        {!canFinance && <Kpi label="Конверсия" value={pct(metrics.conversion)} />}
        {!canFinance && <Kpi label="Объектов в работе" value={metrics.objectsInWork} />}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'summary', label: 'Сводка' },
          { value: 'objects', label: 'Объекты', count: db.objects.length },
          { value: 'people', label: 'Сотрудники', count: db.users.filter((u) => u.active).length },
          { value: 'works', label: 'Работы' },
          ...(canFinance ? [{ value: 'money' as const, label: 'Деньги' }] : []),
        ]}
      />

      {tab === 'summary' && (
        <>
          <div className="grid cols-2">
            <Card title="Воронка по объектам">
              {metrics.funnel.map((f, i) => {
                const prev = metrics.funnel[i - 1];
                const conv = prev && prev.count > 0 ? (f.count / prev.count) * 100 : null;
                return (
                  <div key={f.stage} className="bar-row">
                    <div className="name">{f.stage}</div>
                    <div className="bar">
                      <div style={{ width: `${Math.min(100, (f.count / Math.max(1, metrics.funnel[0].count || 1)) * 100)}%` }} />
                    </div>
                    <div className="val">
                      {f.count}
                      {conv != null && <span className="muted xsmall"> · {Math.round(conv)}%</span>}
                    </div>
                  </div>
                );
              })}
              <div className="note mt-12 xsmall">
                Итоговая конверсия «замер → договор»: <b>{pct(metrics.conversion)}</b>.
                Средний чек: <b>{money(metrics.avgCheck)}</b>.
              </div>
            </Card>

            <Card title="Сметы по месяцам">
              {series.map((s) => (
                <div key={s.label} className="bar-row">
                  <div className="name" style={{ width: 70, flexBasis: 70 }}>{s.label}</div>
                  <div className="bar"><div style={{ width: `${(s.sum / maxSum) * 100}%` }} /></div>
                  <div className="val">{money(s.sum)} <span className="muted xsmall">· {s.count}</span></div>
                </div>
              ))}
            </Card>
          </div>

          <div className="grid cols-2 mt-16">
            <Card title="Задачи отделов" bodyClass="tight">
              <div className="table-wrap">
                <table className="tbl compact">
                  <thead><tr><th>Отдел</th><th className="num">Всего</th><th className="num">В работе</th><th className="num">Заблок.</th><th className="num">Просрочено</th></tr></thead>
                  <tbody>
                    {(['design', 'production'] as const).map((dep) => {
                      const tasks = db.tasks.filter((t) => t.department === dep);
                      const today = new Date().toISOString();
                      return (
                        <tr key={dep}>
                          <td>{dep === 'design' ? 'Дизайн' : 'Производство'}</td>
                          <td className="num">{tasks.length}</td>
                          <td className="num">{tasks.filter((t) => t.status === 'inWork').length}</td>
                          <td className="num">{tasks.filter((t) => t.status === 'blocked').length}</td>
                          <td className="num neg">{tasks.filter((t) => t.status !== 'done' && t.plannedEnd && t.plannedEnd < today).length || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Согласования" bodyClass="tight">
              {db.estimates.filter((e) => e.status === 'onApproval').length === 0
                ? <div className="small muted">Очередь согласований пуста</div>
                : db.estimates.filter((e) => e.status === 'onApproval').map((e) => (
                  <div key={e.id} className="timeline-item">
                    <div className="timeline-dot" style={{ background: 'var(--amber)' }} />
                    <div style={{ flex: 1 }}>
                      <Link to={`/estimates/${e.id}`} className="strong">{e.number}</Link>
                      <div className="xsmall muted">
                        {db.users.find((u) => u.id === e.authorId)?.fullName} · скидка {pct(e.discountPct)} · с {formatDate(e.approval?.requestedAt)}
                      </div>
                    </div>
                    <div className="strong">{money(estimateTotals(e).total)}</div>
                  </div>
                ))}
            </Card>
          </div>
        </>
      )}

      {tab === 'objects' && (
        <Card bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Объект</th><th>Клиент</th><th>Статус</th><th className="num">Площадь</th>
                  <th className="num">Смета</th>{canFinance && <th className="num">Себестоимость</th>}
                  {canFinance && <th className="num">Маржа</th>}<th className="num">Договор</th><th className="num">Оплачено</th>
                </tr>
              </thead>
              <tbody>
                {db.objects.map((o) => {
                  const estimates = db.estimates.filter((e) => e.objectId === o.id);
                  const t = estimates.reduce((acc, e) => {
                    const x = estimateTotals(e);
                    return { total: acc.total + x.total, cost: acc.cost + x.cost };
                  }, { total: 0, cost: 0 });
                  const contract = db.contracts.find((c) => c.objectId === o.id);
                  const paid = contract?.payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0) ?? 0;
                  const margin = t.total - t.cost;
                  return (
                    <tr key={o.id}>
                      <td><div className="strong">{o.title}</div><div className="xsmall muted">{o.address}</div></td>
                      <td className="small">{db.clients.find((c) => c.id === o.clientId)?.fullName ?? '—'}</td>
                      <td className="small">{o.status}</td>
                      <td className="num">{o.area ? `${o.area} м²` : '—'}</td>
                      <td className="num strong">{money(t.total)}</td>
                      {canFinance && <td className="num muted">{money(t.cost)}</td>}
                      {canFinance && <td className={`num ${margin >= 0 ? 'pos' : 'neg'}`}>{money(margin)}{t.total > 0 && <span className="xsmall muted"> · {pct((margin / t.total) * 100)}</span>}</td>}
                      <td className="num">{contract ? money(contract.amount) : '—'}</td>
                      <td className="num">{contract ? money(paid) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'people' && (
        <Card bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Сотрудник</th><th>Роль</th><th className="num">Смет</th><th className="num">Сумма смет</th>
                  <th className="num">Утверждено</th><th className="num">Средний чек</th><th className="num">Объектов</th><th className="num">Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {db.users.filter((u) => u.active).map((u) => {
                  const m = userMetrics(db, u.id);
                  return (
                    <tr key={u.id}>
                      <td className="strong">{u.fullName}</td>
                      <td className="small muted">{roleTitle(u.roleCode, db.roles)}</td>
                      <td className="num">{m.estimates || '—'}</td>
                      <td className="num">{m.sum ? money(m.sum) : '—'}</td>
                      <td className="num">{m.approved || '—'}</td>
                      <td className="num">{m.avgCheck ? money(m.avgCheck) : '—'}</td>
                      <td className="num">{m.objects || '—'}</td>
                      <td className="num">{m.objects ? pct(m.conversion) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'works' && <WorksReport />}

      {tab === 'money' && canFinance && (
        <Card title="Движение по договорам" bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Договор</th><th>Клиент</th><th className="num">Сумма</th><th className="num">Оплачено</th><th className="num">Остаток</th><th className="num">Просрочено</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {db.contracts.map((c) => {
                  const paid = c.payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
                  const today = new Date().toISOString();
                  const overdue = c.payments.filter((p) => !p.paidAt && p.dueDate && p.dueDate < today).reduce((s, p) => s + p.amount, 0);
                  return (
                    <tr key={c.id}>
                      <td className="strong">{c.number}</td>
                      <td className="small">{db.clients.find((x) => x.id === c.clientId)?.fullName ?? '—'}</td>
                      <td className="num">{money(c.amount)}</td>
                      <td className="num pos">{money(paid)}</td>
                      <td className="num">{money(c.amount - paid)}</td>
                      <td className={`num ${overdue ? 'neg' : 'muted'}`}>{overdue ? money(overdue) : '—'}</td>
                      <td className="small">{c.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/** Топ работ по выручке — что реально продаётся. */
function WorksReport() {
  const { db, can } = useApp();
  const rows = useMemo(() => {
    const map = new Map<string, { title: string; unit: string; qty: number; total: number; cost: number; count: number }>();
    for (const e of db.estimates) {
      for (const l of e.lines) {
        const t = lineTotals(l, e);
        const acc = map.get(l.code) ?? { title: l.title, unit: l.unit, qty: 0, total: 0, cost: 0, count: 0 };
        acc.qty += l.qty;
        acc.total += t.total;
        acc.cost += t.cost;
        acc.count += 1;
        map.set(l.code, acc);
      }
    }
    return [...map.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);
  }, [db.estimates]);

  const canCost = can('management.finance');
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <Card title="Топ работ по выручке" bodyClass="tight">
      {rows.length === 0 ? <div className="small muted">Пока нет данных</div> : (
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr><th style={{ width: 54 }}>Код</th><th>Работа</th><th className="num">Объём</th><th className="num">В скольких сметах</th><th className="num">Выручка</th>{canCost && <th className="num">Маржа</th>}<th style={{ width: 130 }} /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="code">{r.code}</td>
                  <td>{r.title}</td>
                  <td className="num">{num(r.qty)} {r.unit}</td>
                  <td className="num">{r.count}</td>
                  <td className="num strong">{money(r.total)}</td>
                  {canCost && <td className={`num ${r.total - r.cost >= 0 ? 'pos' : 'neg'}`}>{money(r.total - r.cost)}</td>}
                  <td><div className="progress"><div style={{ width: `${(r.total / max) * 100}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
