import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { computeMetrics, monthlySeries, userMetrics } from '../lib/analytics';
import { estimateTotals } from '../lib/calc';
import { money, num, pct } from '../lib/money';
import { Badge, Card, Empty, Kpi, formatDate } from '../components/ui';
import { roleTitle } from '../domain/permissions';
import type { Estimate, Task } from '../domain/types';

/**
 * Кабинет сотрудника. Состав блоков зависит от роли:
 * замерщик видит свои сметы и замеры, бухгалтер — деньги,
 * директор — сводку по компании.
 */
export default function Dashboard() {
  const { db, currentUser, can } = useApp();
  const metrics = useMemo(() => computeMetrics(db), [db]);
  const mine = useMemo(() => (currentUser ? userMetrics(db, currentUser.id) : null), [db, currentUser]);
  if (!currentUser || !mine) return null;

  const role = currentUser.roleCode;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Здравствуйте, {currentUser.fullName.split(' ')[1] ?? currentUser.fullName}</h1>
          <p>{roleTitle(role, db.roles)} · {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="spacer" />
        <div className="flex gap-8 wrap">
          {can('estimate.create') && <Link className="btn primary" to="/estimates">+ Новая смета</Link>}
          {can('brief.edit') && <Link className="btn" to="/briefs">📐 Замер на объекте</Link>}
        </div>
      </div>

      {role === 'measurer' && <MeasurerCabinet />}
      {role === 'manager' && <ManagerCabinet />}
      {role === 'head' && <HeadCabinet />}
      {role === 'economist' && <EconomistCabinet />}
      {role === 'accountant' && <AccountantCabinet />}
      {(role === 'director' || role === 'admin') && <DirectorCabinet />}
      {role === 'designer' && <DesignerCabinet />}
      {role === 'production' && <ProductionCabinet />}
      {role === 'client' && <ClientCabinet />}

      {/* Общий блок: последние действия — виден всем, у кого есть управленческий доступ */}
      {can('management.view') && (
        <Card title="Последние действия" className="mt-16" bodyClass="tight">
          {db.audit.slice(0, 8).map((a) => (
            <div key={a.id} className="timeline-item">
              <div className="timeline-dot" />
              <div style={{ flex: 1 }}>
                <div>{a.action} <span className="muted">· {a.details ?? a.entity}</span></div>
                <div className="xsmall muted">{db.users.find((u) => u.id === a.userId)?.fullName ?? '—'} · {formatDate(a.at)}</div>
              </div>
            </div>
          ))}
          {db.audit.length === 0 && <div className="small muted">Пока пусто</div>}
        </Card>
      )}
      <div className="mt-16" />
      <Kpis metrics={metrics} />
    </>
  );
}

/** Нижняя общая полоса — только те цифры, на которые есть права. */
function Kpis({ metrics }: { metrics: ReturnType<typeof computeMetrics> }) {
  const { can } = useApp();
  if (!can('management.view')) return null;
  return (
    <div className="grid cols-4">
      <Kpi label="Объектов в работе" value={metrics.objectsInWork} hint={`${metrics.tasksOpen} открытых задач`} />
      <Kpi label="Конверсия замер → договор" value={pct(metrics.conversion)} />
      <Kpi label="Средний чек" value={money(metrics.avgCheck)} />
      <Kpi
        label="Просроченные задачи"
        value={metrics.tasksOverdue}
        tone={metrics.tasksOverdue > 0 ? 'red' : 'green'}
      />
    </div>
  );
}

/* ─────────────────────── Замерщик ─────────────────────── */

function MeasurerCabinet() {
  const { db, currentUser } = useApp();
  const mine = userMetrics(db, currentUser!.id);
  const myEstimates = db.estimates
    .filter((e) => e.authorId === currentUser!.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const myObjects = db.objects.filter((o) => o.measurerId === currentUser!.id);

  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Мои сметы" value={mine.estimates} hint={`${mine.drafts} черновиков`} />
        <Kpi label="Сумма моих смет" value={money(mine.sum)} />
        <Kpi label="Утверждено" value={mine.approved} hint={money(mine.approvedSum)} tone="green" />
        <Kpi label="Моя конверсия" value={pct(mine.conversion)} hint={`${mine.won} из ${mine.objects} объектов`} />
      </div>

      <div className="grid cols-2">
        <EstimatesTable title="Мои последние сметы" list={myEstimates.slice(0, 7)} />
        <Card title="Мои объекты" actions={<Link className="btn sm" to="/objects">Все объекты</Link>} bodyClass="tight">
          {myObjects.length === 0 && <div className="small muted">Объектов пока нет</div>}
          {myObjects.slice(0, 7).map((o) => {
            const est = db.estimates.filter((e) => e.objectId === o.id);
            return (
              <div key={o.id} className="timeline-item">
                <div className="timeline-dot" />
                <div style={{ flex: 1 }}>
                  <div className="strong">{o.title}</div>
                  <div className="xsmall muted">{o.address} · {o.rooms.length} помещений · смет: {est.length}</div>
                </div>
                <Badge>{OBJECT_STATUS[o.status]}</Badge>
              </div>
            );
          })}
        </Card>
      </div>

      <Card className="mt-16" title="Как быстро собрать смету на объекте">
        <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Создайте смету: <b>«+ Новая смета» → «Новый клиент и объект»</b> — сразу внесите ФИО, телефон, адрес.</li>
          <li>Откройте <b>«📐 Помещения»</b> и внесите длину, ширину, высоту, количество дверей и окон. Площади посчитаются сами.</li>
          <li>Выберите помещение и добавьте <b>набор работ</b> — вся технологическая цепочка попадёт в смету с объёмами.</li>
          <li>Смотрите сумму справа: она пересчитывается на каждое действие.</li>
          <li>Проверьте <b>подсказки</b> — они покажут пропущенные работы (например, штукатурку без маяков).</li>
          <li>Отправьте смету <b>на согласование</b> руководителю.</li>
        </ol>
      </Card>
    </>
  );
}

/* ─────────────────────── Офис-менеджер ─────────────────────── */

function ManagerCabinet() {
  const { db } = useApp();
  const metrics = computeMetrics(db);
  const contractsDraft = db.contracts.filter((c) => c.status === 'draft');
  const approvedNoContract = db.estimates.filter(
    (e) => e.status === 'approved' && !db.contracts.some((c) => c.estimateId === e.id),
  );

  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Клиентов" value={db.clients.length} />
        <Kpi label="Договоров в работе" value={metrics.contractsActive} hint={money(metrics.contractsSum)} />
        <Kpi label="Договоры к подготовке" value={contractsDraft.length} tone={contractsDraft.length ? 'amber' : undefined} />
        <Kpi label="Сметы без договора" value={approvedNoContract.length} hint="утверждены, договор не создан" />
      </div>

      <div className="grid cols-2">
        <Card title="Сметы, готовые к договору" actions={<Link className="btn sm" to="/estimates">Все сметы</Link>} bodyClass="tight">
          {approvedNoContract.length === 0 && <div className="small muted">Все утверждённые сметы обработаны</div>}
          {approvedNoContract.map((e) => {
            const cli = db.clients.find((c) => c.id === e.clientId);
            return (
              <div key={e.id} className="timeline-item">
                <div className="timeline-dot" />
                <div style={{ flex: 1 }}>
                  <Link to={`/estimates/${e.id}`} className="strong">{e.number}</Link>
                  <div className="xsmall muted">{cli?.fullName} · {money(estimateTotals(e).total)}</div>
                </div>
                <Link className="btn xs primary" to={`/estimates/${e.id}`}>В договор</Link>
              </div>
            );
          })}
        </Card>

        <Card title="Договоры в подготовке" actions={<Link className="btn sm" to="/contracts">Все договоры</Link>} bodyClass="tight">
          {contractsDraft.length === 0 && <div className="small muted">Черновиков нет</div>}
          {contractsDraft.map((c) => {
            const cli = db.clients.find((x) => x.id === c.clientId);
            return (
              <div key={c.id} className="timeline-item">
                <div className="timeline-dot" />
                <div style={{ flex: 1 }}>
                  <div className="strong">{c.number}</div>
                  <div className="xsmall muted">{cli?.fullName} · {money(c.amount)}</div>
                </div>
                <Link className="btn xs" to="/contracts">Открыть</Link>
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}

/* ─────────────────────── Руководитель отдела ─────────────────────── */

function HeadCabinet() {
  const { db, currentUser } = useApp();
  const metrics = computeMetrics(db);
  const onApproval = db.estimates.filter((e) => e.status === 'onApproval');
  const team = db.users.filter((u) => u.managerId === currentUser!.id || u.departmentCode === currentUser!.departmentCode);

  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="На согласовании" value={onApproval.length} tone={onApproval.length ? 'amber' : 'green'} hint={money(onApproval.reduce((s, e) => s + estimateTotals(e).total, 0))} />
        <Kpi label="Утверждено смет" value={metrics.estimatesApproved} hint={money(metrics.approvedSum)} />
        <Kpi label="Маржа портфеля" value={money(metrics.marginSum)} hint={pct(metrics.marginPct)} tone={metrics.marginPct >= 25 ? 'green' : 'amber'} />
        <Kpi label="Конверсия отдела" value={pct(metrics.conversion)} />
      </div>

      <div className="grid cols-2">
        <Card title="Ждут вашего согласования" actions={<Link className="btn sm" to="/approvals">Все</Link>} bodyClass="tight">
          {onApproval.length === 0 && <div className="small muted">Очередь пуста</div>}
          {onApproval.map((e) => {
            const t = estimateTotals(e);
            const author = db.users.find((u) => u.id === e.authorId);
            return (
              <div key={e.id} className="timeline-item">
                <div className="timeline-dot" />
                <div style={{ flex: 1 }}>
                  <Link to={`/estimates/${e.id}`} className="strong">{e.number}</Link>
                  <div className="xsmall muted">{author?.fullName} · скидка {pct(e.discountPct)} · маржа {pct(t.marginPct)}</div>
                </div>
                <div className="right">
                  <div className="strong">{money(t.total)}</div>
                </div>
              </div>
            );
          })}
        </Card>

        <Card title="Команда" bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl compact">
              <thead><tr><th>Сотрудник</th><th className="num">Смет</th><th className="num">Сумма</th><th className="num">Конверсия</th></tr></thead>
              <tbody>
                {team.map((u) => {
                  const m = userMetrics(db, u.id);
                  return (
                    <tr key={u.id}>
                      <td>{u.fullName}<div className="xsmall muted">{roleTitle(u.roleCode, db.roles)}</div></td>
                      <td className="num">{m.estimates}</td>
                      <td className="num">{money(m.sum)}</td>
                      <td className="num">{m.objects ? pct(m.conversion) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ─────────────────────── Экономист ─────────────────────── */

function EconomistCabinet() {
  const { db } = useApp();
  const metrics = computeMetrics(db);
  const lowMargin = db.estimates
    .map((e) => ({ e, t: estimateTotals(e) }))
    .filter((x) => x.t.total > 0 && x.t.marginPct < 20)
    .sort((a, b) => a.t.marginPct - b.t.marginPct);

  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Портфель смет" value={money(metrics.estimatesSum)} hint={`${metrics.estimatesTotal} смет`} />
        <Kpi label="Себестоимость" value={money(metrics.costSum)} />
        <Kpi label="Маржа" value={money(metrics.marginSum)} hint={pct(metrics.marginPct)} tone={metrics.marginPct >= 25 ? 'green' : 'amber'} />
        <Kpi label="Позиций в прайсе" value={db.catalog.length} hint={<Link to="/catalog">открыть прайс</Link>} />
      </div>

      <Card title="Сметы с низкой рентабельностью" bodyClass="tight"
        actions={<span className="xsmall muted">ниже 20% — проверить наценку и себестоимость</span>}>
        {lowMargin.length === 0 ? <div className="small muted">Все сметы в норме</div> : (
          <div className="table-wrap">
            <table className="tbl compact">
              <thead><tr><th>Смета</th><th>Объект</th><th className="num">Сумма</th><th className="num">Себестоимость</th><th className="num">Маржа</th><th className="num">Рент.</th></tr></thead>
              <tbody>
                {lowMargin.map(({ e, t }) => (
                  <tr key={e.id}>
                    <td><Link to={`/estimates/${e.id}`}>{e.number}</Link></td>
                    <td className="small">{db.objects.find((o) => o.id === e.objectId)?.title ?? '—'}</td>
                    <td className="num">{money(t.total)}</td>
                    <td className="num muted">{money(t.cost)}</td>
                    <td className={`num ${t.margin >= 0 ? 'pos' : 'neg'}`}>{money(t.margin)}</td>
                    <td className="num strong">{pct(t.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ─────────────────────── Бухгалтер ─────────────────────── */

function AccountantCabinet() {
  const { db } = useApp();
  const metrics = computeMetrics(db);
  const today = new Date().toISOString();
  const payments = db.contracts.flatMap((c) =>
    c.payments.map((p) => ({ ...p, contract: c, client: db.clients.find((x) => x.id === c.clientId) })),
  );
  const unpaid = payments.filter((p) => !p.paidAt).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Сумма договоров" value={money(metrics.contractsSum)} hint={`${metrics.contractsActive} активных`} />
        <Kpi label="Оплачено" value={money(metrics.paidSum)} tone="green" />
        <Kpi label="Дебиторка" value={money(metrics.receivable)} tone={metrics.receivable > 0 ? 'amber' : 'green'} />
        <Kpi label="Просрочено" value={money(metrics.overdueSum)} tone={metrics.overdueSum > 0 ? 'red' : 'green'} />
      </div>

      <Card title="График платежей" actions={<Link className="btn sm" to="/contracts">Договоры</Link>} bodyClass="tight">
        {unpaid.length === 0 ? <div className="small muted">Неоплаченных платежей нет</div> : (
          <div className="table-wrap">
            <table className="tbl compact">
              <thead><tr><th>Договор</th><th>Клиент</th><th>Этап</th><th className="num">Сумма</th><th className="num">Срок</th><th>Статус</th></tr></thead>
              <tbody>
                {unpaid.map((p) => {
                  const overdue = p.dueDate && p.dueDate < today;
                  return (
                    <tr key={p.id}>
                      <td>{p.contract.number}</td>
                      <td className="small">{p.client?.fullName ?? '—'}</td>
                      <td className="small">{p.title}</td>
                      <td className="num strong">{money(p.amount)}</td>
                      <td className="num small">{formatDate(p.dueDate)}</td>
                      <td>{overdue ? <Badge kind="red">просрочен</Badge> : <Badge kind="amber">ожидается</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ─────────────────────── Директор ─────────────────────── */

function DirectorCabinet() {
  const { db } = useApp();
  const metrics = computeMetrics(db);
  const series = monthlySeries(db, 6);
  const maxSum = Math.max(1, ...series.map((s) => s.sum));

  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Портфель заказов" value={money(metrics.contractsSum)} hint={`${metrics.contractsActive} договоров в работе`} />
        <Kpi label="Маржа портфеля" value={money(metrics.marginSum)} hint={pct(metrics.marginPct)} tone={metrics.marginPct >= 25 ? 'green' : 'amber'} />
        <Kpi label="Дебиторка" value={money(metrics.receivable)} tone={metrics.overdueSum > 0 ? 'red' : undefined} hint={metrics.overdueSum > 0 ? `просрочено ${money(metrics.overdueSum)}` : 'без просрочки'} />
        <Kpi label="Конверсия" value={pct(metrics.conversion)} hint={`средний чек ${money(metrics.avgCheck)}`} />
      </div>

      <div className="grid cols-2">
        <Card title="Воронка объектов">
          {metrics.funnel.map((f) => (
            <div key={f.stage} className="bar-row">
              <div className="name">{f.stage}</div>
              <div className="bar">
                <div style={{ width: `${Math.min(100, (f.count / Math.max(1, metrics.funnel[0].count || 1)) * 100)}%` }} />
              </div>
              <div className="val">{f.count} · {money(f.sum)}</div>
            </div>
          ))}
        </Card>

        <Card title="Сметы по месяцам">
          {series.map((s) => (
            <div key={s.label} className="bar-row">
              <div className="name" style={{ width: 70, flexBasis: 70 }}>{s.label}</div>
              <div className="bar"><div style={{ width: `${(s.sum / maxSum) * 100}%` }} /></div>
              <div className="val">{money(s.sum)}</div>
            </div>
          ))}
          <div className="xsmall muted mt-8">Всего смет за период: {num(series.reduce((s, x) => s + x.count, 0), 0)}</div>
        </Card>
      </div>

      <Card className="mt-16" title="Сводка по отделам" bodyClass="tight">
        <div className="table-wrap">
          <table className="tbl compact">
            <thead><tr><th>Отдел</th><th className="num">Сотрудников</th><th className="num">Открытых задач</th><th className="num">Просрочено</th></tr></thead>
            <tbody>
              {(['sales', 'design', 'production', 'finance', 'management'] as const).map((dep) => {
                const users = db.users.filter((u) => u.departmentCode === dep && u.active);
                const tasks = db.tasks.filter((t) => (dep === 'design' ? t.department === 'design' : dep === 'production' ? t.department === 'production' : false));
                const open = tasks.filter((t) => t.status !== 'done');
                const overdue = open.filter((t) => t.plannedEnd && t.plannedEnd < new Date().toISOString());
                return (
                  <tr key={dep}>
                    <td>{DEP_TITLES[dep]}</td>
                    <td className="num">{users.length}</td>
                    <td className="num">{open.length || '—'}</td>
                    <td className={`num ${overdue.length ? 'neg' : ''}`}>{overdue.length || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ─────────────────────── Дизайнер и производство ─────────────────────── */

function DesignerCabinet() {
  const { db, currentUser } = useApp();
  const tasks = db.tasks.filter((t) => t.department === 'design' && (!t.assigneeId || t.assigneeId === currentUser!.id));
  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Задач в работе" value={tasks.filter((t) => t.status === 'inWork').length} />
        <Kpi label="Новых" value={tasks.filter((t) => t.status === 'new').length} />
        <Kpi label="Завершено" value={tasks.filter((t) => t.status === 'done').length} tone="green" />
        <Kpi label="Объектов" value={new Set(tasks.map((t) => t.objectId)).size} />
      </div>
      <TasksCard title="Мои задачи по дизайну" tasks={tasks} link="/design" />
    </>
  );
}

function ProductionCabinet() {
  const { db, currentUser } = useApp();
  const tasks = db.tasks.filter((t) => t.department === 'production' && (!t.assigneeId || t.assigneeId === currentUser!.id));
  const objects = db.objects.filter((o) => o.status === 'inWork' || o.status === 'contract');
  return (
    <>
      <div className="grid cols-4 mb-16">
        <Kpi label="Объектов в работе" value={objects.length} />
        <Kpi label="Задач в работе" value={tasks.filter((t) => t.status === 'inWork').length} />
        <Kpi label="Заблокировано" value={tasks.filter((t) => t.status === 'blocked').length} tone={tasks.some((t) => t.status === 'blocked') ? 'red' : undefined} />
        <Kpi label="Завершено" value={tasks.filter((t) => t.status === 'done').length} tone="green" />
      </div>
      <TasksCard title="Мои задачи по производству" tasks={tasks} link="/production" />
    </>
  );
}

function ClientCabinet() {
  const { db, currentUser } = useApp();
  const myContracts = db.contracts.filter((c) => db.clients.find((x) => x.id === c.clientId)?.email === currentUser!.email);
  return myContracts.length === 0
    ? <Empty icon="📁" title="Документов пока нет" hint="Здесь появятся ваши договоры, сметы и акты." />
    : <Card title="Мои договоры" bodyClass="tight">
      {myContracts.map((c) => (
        <div key={c.id} className="timeline-item">
          <div className="timeline-dot" />
          <div style={{ flex: 1 }}><div className="strong">{c.number}</div><div className="xsmall muted">{formatDate(c.date)}</div></div>
          <div className="strong">{money(c.amount)}</div>
        </div>
      ))}
    </Card>;
}

/* ─────────────────────── Общие блоки ─────────────────────── */

function EstimatesTable({ title, list }: { title: string; list: Estimate[] }) {
  const { db } = useApp();
  return (
    <Card title={title} actions={<Link className="btn sm" to="/estimates">Все сметы</Link>} bodyClass="tight">
      {list.length === 0 ? <div className="small muted">Смет пока нет</div> : (
        <div className="table-wrap">
          <table className="tbl compact">
            <thead><tr><th>Номер</th><th>Объект</th><th className="num">Сумма</th><th>Статус</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/estimates/${e.id}`}>{e.number}</Link></td>
                  <td className="small">{db.objects.find((o) => o.id === e.objectId)?.title ?? '—'}</td>
                  <td className="num strong">{money(estimateTotals(e).total)}</td>
                  <td><Badge>{ESTIMATE_STATUS[e.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TasksCard({ title, tasks, link }: { title: string; tasks: Task[]; link: string }) {
  const { db } = useApp();
  return (
    <Card title={title} actions={<Link className="btn sm" to={link}>Все задачи</Link>} bodyClass="tight">
      {tasks.length === 0 && <div className="small muted">Задач нет</div>}
      {tasks.map((t) => (
        <div key={t.id} className="timeline-item">
          <div className="timeline-dot" style={{ background: TASK_COLOR[t.status] }} />
          <div style={{ flex: 1 }}>
            <div className="strong">{t.title}</div>
            <div className="xsmall muted">
              {db.objects.find((o) => o.id === t.objectId)?.title ?? '—'} · срок {formatDate(t.plannedEnd)}
              {t.note ? ` · ${t.note}` : ''}
            </div>
          </div>
          <Badge kind={t.status === 'blocked' ? 'red' : t.status === 'done' ? 'green' : t.status === 'inWork' ? 'blue' : undefined}>
            {TASK_STATUS[t.status]}
          </Badge>
        </div>
      ))}
    </Card>
  );
}

export const OBJECT_STATUS: Record<string, string> = {
  lead: 'Заявка', measured: 'Замер сделан', estimated: 'Смета готова',
  contract: 'Договор', inWork: 'В работе', done: 'Завершён', lost: 'Отказ',
};
export const ESTIMATE_STATUS: Record<string, string> = {
  draft: 'Черновик', onApproval: 'На согласовании', approved: 'Утверждена',
  rejected: 'Отклонена', sent: 'Отправлена', signed: 'Подписана', archived: 'Архив',
};
export const TASK_STATUS: Record<string, string> = {
  new: 'Новая', inWork: 'В работе', review: 'На проверке', done: 'Готово', blocked: 'Блокировано',
};
const TASK_COLOR: Record<string, string> = {
  new: '#94a3b8', inWork: '#1f6feb', review: '#6d3cd6', done: '#128a52', blocked: '#c0392b',
};
const DEP_TITLES: Record<string, string> = {
  sales: 'Продажи и замеры', design: 'Дизайн', production: 'Производство', finance: 'Финансы', management: 'Руководство',
};
