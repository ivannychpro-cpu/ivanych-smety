import type { DB, Estimate, ID } from '../domain/types';
import { estimateTotals } from './calc';
import { round2 } from './geometry';

export interface Metrics {
  /** Сметы */
  estimatesTotal: number;
  estimatesDraft: number;
  estimatesOnApproval: number;
  estimatesApproved: number;
  estimatesSum: number;
  approvedSum: number;
  avgCheck: number;
  /** Договоры и деньги */
  contractsActive: number;
  contractsSum: number;
  paidSum: number;
  receivable: number;       // дебиторка: по договорам минус оплачено
  overdueSum: number;       // просроченные платежи
  /** Маржа */
  costSum: number;          // себестоимость по утверждённым сметам
  marginSum: number;
  marginPct: number;
  /** Воронка */
  funnel: { stage: string; count: number; sum: number }[];
  conversion: number;       // из замера в договор, %
  /** Производство */
  objectsInWork: number;
  tasksOpen: number;
  tasksOverdue: number;
}

export function computeMetrics(db: DB): Metrics {
  const totalsById = new Map<ID, ReturnType<typeof estimateTotals>>();
  for (const e of db.estimates) totalsById.set(e.id, estimateTotals(e));
  const sum = (list: Estimate[]) => round2(list.reduce((s, e) => s + (totalsById.get(e.id)?.total ?? 0), 0));

  const approved = db.estimates.filter((e) => ['approved', 'sent', 'signed'].includes(e.status));
  const estimatesSum = sum(db.estimates);
  const approvedSum = sum(approved);
  const costSum = round2(approved.reduce((s, e) => s + (totalsById.get(e.id)?.cost ?? 0), 0));
  const marginSum = round2(approvedSum - costSum);

  const activeContracts = db.contracts.filter((c) => ['signed', 'inWork'].includes(c.status));
  const contractsSum = round2(activeContracts.reduce((s, c) => s + c.amount, 0));
  const paidSum = round2(
    db.contracts.reduce((s, c) => s + c.payments.filter((p) => p.paidAt).reduce((x, p) => x + p.amount, 0), 0),
  );
  const today = new Date().toISOString();
  const overdueSum = round2(
    db.contracts.reduce(
      (s, c) => s + c.payments.filter((p) => !p.paidAt && p.dueDate && p.dueDate < today).reduce((x, p) => x + p.amount, 0),
      0,
    ),
  );

  const byStatus = (s: string) => db.objects.filter((o) => o.status === s);
  const objectSum = (ids: ID[]) =>
    round2(db.estimates.filter((e) => ids.includes(e.objectId)).reduce((s, e) => s + (totalsById.get(e.id)?.total ?? 0), 0));

  const funnel = [
    { stage: 'Заявки', list: byStatus('lead') },
    { stage: 'Замер сделан', list: byStatus('measured') },
    { stage: 'Смета готова', list: byStatus('estimated') },
    { stage: 'Договор', list: byStatus('contract') },
    { stage: 'В работе', list: byStatus('inWork') },
    { stage: 'Завершён', list: byStatus('done') },
  ].map((f) => ({ stage: f.stage, count: f.list.length, sum: objectSum(f.list.map((o) => o.id)) }));

  const measured = db.objects.filter((o) => o.status !== 'lead' && o.status !== 'lost').length;
  const contracted = db.objects.filter((o) => ['contract', 'inWork', 'done'].includes(o.status)).length;

  const openTasks = db.tasks.filter((t) => !['done'].includes(t.status));
  const overdueTasks = openTasks.filter((t) => t.plannedEnd && t.plannedEnd < today);

  return {
    estimatesTotal: db.estimates.length,
    estimatesDraft: db.estimates.filter((e) => e.status === 'draft').length,
    estimatesOnApproval: db.estimates.filter((e) => e.status === 'onApproval').length,
    estimatesApproved: approved.length,
    estimatesSum,
    approvedSum,
    avgCheck: approved.length ? round2(approvedSum / approved.length) : 0,
    contractsActive: activeContracts.length,
    contractsSum,
    paidSum,
    receivable: round2(contractsSum - paidSum),
    overdueSum,
    costSum,
    marginSum,
    marginPct: approvedSum > 0 ? round2((marginSum / approvedSum) * 100) : 0,
    funnel,
    conversion: measured > 0 ? round2((contracted / measured) * 100) : 0,
    objectsInWork: db.objects.filter((o) => o.status === 'inWork' || o.status === 'contract').length,
    tasksOpen: openTasks.length,
    tasksOverdue: overdueTasks.length,
  };
}

/** Показатели по сотруднику — для кабинета и для руководителя. */
export function userMetrics(db: DB, userId: ID) {
  const mine = db.estimates.filter((e) => e.authorId === userId);
  const totals = mine.map((e) => estimateTotals(e));
  const approved = mine.filter((e) => ['approved', 'sent', 'signed'].includes(e.status));
  const approvedSum = round2(approved.reduce((s, e) => s + estimateTotals(e).total, 0));
  const myObjects = db.objects.filter((o) => o.measurerId === userId);
  const won = myObjects.filter((o) => ['contract', 'inWork', 'done'].includes(o.status)).length;

  return {
    estimates: mine.length,
    drafts: mine.filter((e) => e.status === 'draft').length,
    onApproval: mine.filter((e) => e.status === 'onApproval').length,
    approved: approved.length,
    sum: round2(totals.reduce((s, t) => s + t.total, 0)),
    approvedSum,
    avgCheck: approved.length ? round2(approvedSum / approved.length) : 0,
    objects: myObjects.length,
    won,
    conversion: myObjects.length ? round2((won / myObjects.length) * 100) : 0,
  };
}

/** Помесячная динамика сумм смет за последние N месяцев. */
export function monthlySeries(db: DB, months = 6): { label: string; sum: number; count: number }[] {
  const out: { label: string; sum: number; count: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const list = db.estimates.filter((e) => {
      const t = new Date(e.createdAt);
      return t >= d && t < next;
    });
    out.push({
      label: d.toLocaleDateString('ru-RU', { month: 'short' }),
      sum: round2(list.reduce((s, e) => s + estimateTotals(e).total, 0)),
      count: list.length,
    });
  }
  return out;
}
