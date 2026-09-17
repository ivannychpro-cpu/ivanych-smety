import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { CatalogItem, Estimate, EstimateLine, ID, Room, WorkBundle } from '../domain/types';
import { Badge, Card, Confirm, Empty, Modal, NumInput, TextInput, formatDateTime } from '../components/ui';
import WorkPicker from '../components/WorkPicker';
import RoomsEditor from '../components/RoomsEditor';
import { money, num, pct } from '../lib/money';
import { QTY_BASIS_SHORT, roomGeometry } from '../lib/geometry';
import { checkLimits, estimateTotals, lineTotals, techHints, totalsByRoom } from '../lib/calc';
import { addBundle, addCatalogItem, recalcAutoQty, refreshPrices, searchCatalog } from '../lib/estimateOps';
import { mkId, nextNumber } from '../lib/id';

const STATUS_VIEW: Record<Estimate['status'], { label: string; kind?: 'blue' | 'green' | 'amber' | 'red' | 'purple' }> = {
  draft: { label: 'Черновик' },
  onApproval: { label: 'На согласовании', kind: 'amber' },
  approved: { label: 'Утверждена', kind: 'green' },
  rejected: { label: 'Отклонена', kind: 'red' },
  sent: { label: 'Отправлена клиенту', kind: 'blue' },
  signed: { label: 'Подписана', kind: 'purple' },
  archived: { label: 'В архиве' },
};

export default function EstimateEditor() {
  const { id } = useParams<{ id: string }>();
  const { db, update, can, currentUser, toast } = useApp();
  const nav = useNavigate();

  const estimate = db.estimates.find((e) => e.id === id);
  const object = db.objects.find((o) => o.id === estimate?.objectId);
  const client = db.clients.find((c) => c.id === estimate?.clientId);

  const [activeRoomId, setActiveRoomId] = useState<ID | null>(object?.rooms[0]?.id ?? null);
  const [groupBy, setGroupBy] = useState<'room' | 'section'>('room');
  const [showPicker, setShowPicker] = useState(false);
  const [showRooms, setShowRooms] = useState(false);
  const [quick, setQuick] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<EstimateLine | null>(null);
  const [showApprove, setShowApprove] = useState(false);

  const canMarkupView = can('estimate.markup.view');
  const canMarkupEdit = can('estimate.markup.edit');
  const canDiscountView = can('estimate.discount.view');
  const canDiscountEdit = can('estimate.discount.edit');
  const canCost = can('estimate.cost.view');
  const canMargin = can('estimate.margin.view');
  const locked = !!estimate && ['approved', 'signed', 'archived'].includes(estimate.status);
  const readOnly = !can('estimate.edit') || locked;

  const totals = useMemo(() => (estimate ? estimateTotals(estimate) : null), [estimate]);
  const hints = useMemo(() => (estimate ? techHints(estimate, db.catalog) : []), [estimate, db.catalog]);
  const limitProblems = useMemo(
    () => (estimate ? checkLimits(estimate, currentUser?.limits) : []),
    [estimate, currentUser],
  );
  const quickResults = useMemo(() => searchCatalog(db.catalog, quick, 8), [db.catalog, quick]);

  if (!estimate || !object) {
    return <Empty icon="🧮" title="Смета не найдена" action={<Link className="btn" to="/estimates">К списку смет</Link>} />;
  }

  const rooms = object.rooms;
  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  /* ───────── операции ───────── */

  const patch = (fn: (e: Estimate) => void, auditAction?: string) => {
    update((draft) => {
      const e = draft.estimates.find((x) => x.id === estimate.id);
      if (!e) return;
      fn(e);
      e.updatedAt = new Date().toISOString();
    }, auditAction ? { action: auditAction, entity: 'estimate', entityId: estimate.id, details: estimate.number } : undefined);
  };

  const patchLine = (lineId: ID, p: Partial<EstimateLine>) =>
    patch((e) => {
      const l = e.lines.find((x) => x.id === lineId);
      if (l) Object.assign(l, p);
    });

  const addItem = (item: CatalogItem, room?: Room) => {
    patch((e) => {
      const res = addCatalogItem(e, item, room ?? activeRoom);
      if (res.merged) toast(`«${item.title}» уже есть в этом помещении`, 'info');
    });
  };

  const onAddBundle = (bundle: WorkBundle, includeOptional: boolean) => {
    patch((e) => {
      const res = addBundle(e, bundle, db.catalog, rooms, activeRoomId, includeOptional);
      toast(`Набор «${bundle.title}»: добавлено ${res.added} работ`, 'success');
    }, 'estimate.addBundle');
  };

  const addCustomLine = () => {
    patch((e) => {
      e.lines.push({
        id: mkId('ln-'), roomId: activeRoomId, catalogItemId: null, code: '—', title: 'Произвольная работа',
        unit: 'шт', kind: 'work', qty: 1, qtyAuto: false, qtyBasis: 'manual', basePrice: 0, cost: 0,
        order: e.lines.reduce((m, l) => Math.max(m, l.order), 0) + 1,
      });
    });
  };

  const applyRooms = (next: Room[]) => {
    update((draft) => {
      const o = draft.objects.find((x) => x.id === object.id);
      if (o) o.rooms = next;
      const e = draft.estimates.find((x) => x.id === estimate.id);
      if (e) {
        const changed = recalcAutoQty(e, next, draft.catalog);
        if (changed) e.updatedAt = new Date().toISOString();
      }
    }, { action: 'object.rooms', entity: 'object', entityId: object.id, details: object.title });
  };

  const sendToApproval = () => {
    patch((e) => {
      e.status = 'onApproval';
      e.approval = { ...(e.approval ?? {}), requestedAt: new Date().toISOString() };
    }, 'estimate.sendToApproval');
    toast('Смета отправлена на согласование руководителю', 'success');
  };

  const approve = (ok: boolean, reason?: string) => {
    patch((e) => {
      e.status = ok ? 'approved' : 'rejected';
      e.approval = {
        ...(e.approval ?? {}),
        approvedBy: currentUser?.id,
        approvedAt: new Date().toISOString(),
        rejectReason: ok ? undefined : reason,
      };
    }, ok ? 'estimate.approve' : 'estimate.reject');
    toast(ok ? 'Смета утверждена' : 'Смета отклонена', ok ? 'success' : 'error');
  };

  const makeVersion = () => {
    const copyId = mkId('est-');
    update((draft) => {
      const src = draft.estimates.find((x) => x.id === estimate.id)!;
      const copy: Estimate = structuredClone(src);
      copy.id = copyId;
      copy.number = `${src.number}/${src.version + 1}`;
      copy.version = src.version + 1;
      copy.parentId = src.id;
      copy.status = 'draft';
      copy.approval = undefined;
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      copy.lines = copy.lines.map((l) => ({ ...l, id: mkId('ln-') }));
      draft.estimates.unshift(copy);
    }, { action: 'estimate.version', entity: 'estimate', entityId: estimate.id, details: estimate.number });
    toast('Создана новая версия сметы', 'success');
    nav(`/estimates/${copyId}`);
  };

  const createContract = () => {
    const contractId = mkId('ctr-');
    update((draft) => {
      const t = estimateTotals(estimate);
      draft.contracts.unshift({
        id: contractId,
        number: nextNumber('Д', draft.contracts.map((c) => c.number)),
        date: new Date().toISOString(),
        clientId: estimate.clientId,
        objectId: estimate.objectId,
        estimateId: estimate.id,
        amount: t.total,
        status: 'draft',
        managerId: currentUser?.id,
        terms: { prepaymentPct: 30, warrantyMonths: 24, penaltyPctPerDay: 0.1 },
        payments: [
          { id: mkId('pay-'), title: 'Аванс 30%', amount: Math.round(t.total * 0.3), paidAt: null },
          { id: mkId('pay-'), title: 'Черновой этап 40%', amount: Math.round(t.total * 0.4), paidAt: null },
          { id: mkId('pay-'), title: 'Завершение 30%', amount: t.total - Math.round(t.total * 0.3) - Math.round(t.total * 0.4), paidAt: null },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const o = draft.objects.find((x) => x.id === estimate.objectId);
      if (o && o.status !== 'inWork') o.status = 'contract';
    }, { action: 'contract.createFromEstimate', entity: 'estimate', entityId: estimate.id, details: estimate.number });
    toast('Договор создан на основании сметы', 'success');
    nav('/contracts');
  };

  /* ───────── группировка строк ───────── */

  const groups = useMemo<{ key: string; title: string; sub?: string; lines: EstimateLine[] }[]>(() => {
    const sorted = [...estimate.lines].sort((a, b) => a.order - b.order);
    if (groupBy === 'room') {
      const out: { key: string; title: string; sub?: string; lines: EstimateLine[] }[] = [];
      for (const r of rooms) {
        const lines = sorted.filter((l) => l.roomId === r.id);
        if (lines.length) {
          const g = roomGeometry(r);
          out.push({
            key: r.id,
            title: r.name,
            sub: `пол ${num(g.floor)} м² · стены ${num(g.walls)} м² · периметр ${num(g.perimeter)} м`,
            lines,
          });
        }
      }
      const common = sorted.filter((l) => !l.roomId || !rooms.some((r) => r.id === l.roomId));
      if (common.length) out.push({ key: '__common__', title: 'Общие работы по объекту', lines: common });
      return out;
    }
    const bySection = new Map<string, EstimateLine[]>();
    for (const l of sorted) {
      const item = db.catalog.find((c) => c.id === l.catalogItemId);
      const sec = db.sections.find((s) => s.id === item?.sectionId);
      const key = sec ? `${sec.code} ${sec.title}` : 'Прочее';
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(l);
    }
    return [...bySection.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, lines]) => ({ key: title, title, lines }));
  }, [estimate.lines, groupBy, rooms, db.catalog, db.sections]);

  const roomTotals = useMemo(() => totalsByRoom(estimate, rooms), [estimate, rooms]);
  const status = STATUS_VIEW[estimate.status];

  /* ───────── разметка ───────── */

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex items-center gap-8" style={{ gap: 10 }}>
            <h1>{estimate.title}</h1>
            <Badge kind={status.kind}>{status.label}</Badge>
            {estimate.version > 1 && <Badge>версия {estimate.version}</Badge>}
          </div>
          <p>
            {estimate.number} · <Link to="/objects">{object.title}</Link> · {client?.fullName ?? '—'}
            {' · '}изменена {formatDateTime(estimate.updatedAt)}
          </p>
        </div>
        <div className="spacer" />
        <div className="flex gap-8 wrap no-print">
          <button className="btn" onClick={() => setShowRooms(true)}>📐 Помещения ({rooms.length})</button>
          <Link className="btn" to={`/documents/estimate/${estimate.id}`}>🖨 Печать сметы</Link>
          {estimate.status === 'draft' && !readOnly && (
            <button className="btn" onClick={sendToApproval}>На согласование</button>
          )}
          {can('estimate.approve') && estimate.status === 'onApproval' && (
            <button className="btn success" onClick={() => setShowApprove(true)}>Согласовать</button>
          )}
          {locked && can('estimate.edit') && (
            <button className="btn" onClick={makeVersion}>Новая версия</button>
          )}
          {can('contract.edit') && ['approved', 'signed'].includes(estimate.status) && (
            <button className="btn primary" onClick={createContract}>📑 В договор</button>
          )}
        </div>
      </div>

      {locked && (
        <div className="note warn mb-12">
          Смета {estimate.status === 'approved' ? 'утверждена' : 'закрыта'} и защищена от правок.
          Чтобы внести изменения — создайте новую версию.
        </div>
      )}
      {limitProblems.map((p) => <div key={p} className="note warn mb-12">{p}</div>)}

      <div className="estimate-layout">
        <div>
          {/* Быстрое добавление */}
          {!readOnly && (
            <Card className="mb-12" bodyClass="tight">
              <div className="row" style={{ alignItems: 'center' }}>
                <div className="grow" style={{ position: 'relative', minWidth: 260 }}>
                  <input
                    type="search"
                    placeholder="Быстрый поиск работы: начните печатать «штукат», «стяжк», «плитк»…"
                    value={quick}
                    onChange={(e) => setQuick(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && quickResults[0]) { addItem(quickResults[0]); setQuick(''); }
                      if (e.key === 'Escape') setQuick('');
                    }}
                  />
                  {quick.trim() && (
                    <div className="card" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 40, maxHeight: 320, overflowY: 'auto' }}>
                      {quickResults.length === 0 && <div className="card-body small muted">Ничего не найдено</div>}
                      {quickResults.map((it) => (
                        <div key={it.id} className="picker-item" onClick={() => { addItem(it); setQuick(''); }}>
                          <div className="t">
                            <b>{it.title}</b>
                            <span>{it.code} · {it.unit} · {QTY_BASIS_SHORT[it.qtyBasis]}</span>
                          </div>
                          <div className="mono strong">{money(it.price)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn primary" onClick={() => setShowPicker(true)}>+ Работы и наборы</button>
                <button className="btn" onClick={addCustomLine}>+ Своя строка</button>
              </div>

              <div className="flex gap-8 wrap mt-12" style={{ alignItems: 'center' }}>
                <span className="xsmall muted">Помещение для добавления:</span>
                {rooms.map((r) => {
                  const cnt = estimate.lines.filter((l) => l.roomId === r.id).length;
                  return (
                    <button
                      key={r.id}
                      className={`room-chip ${activeRoomId === r.id ? 'active' : ''}`}
                      onClick={() => setActiveRoomId(r.id)}
                    >
                      {r.name}{cnt > 0 && <span className="n">{cnt}</span>}
                    </button>
                  );
                })}
                <button
                  className={`room-chip ${activeRoomId === null ? 'active' : ''}`}
                  onClick={() => setActiveRoomId(null)}
                >
                  Общие работы
                </button>
              </div>
            </Card>
          )}

          {/* Технологические подсказки */}
          {hints.length > 0 && !readOnly && (
            <Card className="mb-12" title="Технологические подсказки" bodyClass="tight"
              actions={<span className="xsmall muted">работы, которые не делаются одна без другой</span>}>
              {hints.slice(0, 8).map((h, i) => (
                <div key={i} className={`hint-row ${h.level}`}>
                  <span>{h.level === 'required' ? '⚠️' : '💡'}</span>
                  <span>
                    <b>{h.title}</b>
                    <span className="muted"> — {h.level === 'required' ? 'обязательна' : 'обычно идёт'} вместе с «{h.becauseTitle}»</span>
                    {h.roomId && <span className="muted"> · {rooms.find((r) => r.id === h.roomId)?.name}</span>}
                  </span>
                  <span className="spacer" />
                  <button
                    className="btn xs primary"
                    onClick={() => {
                      const item = db.catalog.find((c) => c.code === h.code);
                      const room = rooms.find((r) => r.id === h.roomId);
                      if (item) addItem(item, room);
                    }}
                  >
                    Добавить
                  </button>
                </div>
              ))}
              {hints.length > 8 && <div className="xsmall muted">и ещё {hints.length - 8}…</div>}
            </Card>
          )}

          {/* Таблица сметы */}
          <Card
            title={`Состав сметы · ${estimate.lines.length} строк`}
            bodyClass="tight"
            actions={
              <div className="btn-group no-print">
                <button className={`btn sm ${groupBy === 'room' ? 'active' : ''}`} onClick={() => setGroupBy('room')}>По помещениям</button>
                <button className={`btn sm ${groupBy === 'section' ? 'active' : ''}`} onClick={() => setGroupBy('section')}>По разделам</button>
              </div>
            }
          >
            {estimate.lines.length === 0 ? (
              <Empty
                icon="🧮"
                title="В смете пока пусто"
                hint="Добавьте работы поиском, из прайса или готовым набором — объёмы посчитаются по габаритам помещения."
                action={<button className="btn primary" onClick={() => setShowPicker(true)}>Добавить работы</button>}
              />
            ) : (
              <div className="table-wrap">
                <table className="tbl compact">
                  <thead>
                    <tr>
                      <th style={{ width: 54 }}>Код</th>
                      <th>Наименование работы</th>
                      <th style={{ width: 52 }}>Ед.</th>
                      <th className="num" style={{ width: 88 }}>Кол-во</th>
                      <th className="num" style={{ width: 92 }}>Цена</th>
                      {canMarkupView && <th className="num" style={{ width: 74 }}>Нац., %</th>}
                      {canDiscountView && <th className="num" style={{ width: 74 }}>Скид., %</th>}
                      <th className="num" style={{ width: 110 }}>Сумма</th>
                      {canCost && <th className="num" style={{ width: 100 }}>Себест.</th>}
                      {canMargin && <th className="num" style={{ width: 100 }}>Маржа</th>}
                      {!readOnly && <th style={{ width: 34 }} />}
                    </tr>
                  </thead>
                  {groups.map((g) => {
                    const gTotal = g.lines.reduce((s, l) => s + lineTotals(l, estimate).total, 0);
                    return (
                      <tbody key={g.key}>
                        <tr className="group-row">
                          <td colSpan={2}>
                            {g.title}
                            {g.sub && <span className="muted xsmall" style={{ textTransform: 'none', fontWeight: 400 }}> · {g.sub}</span>}
                          </td>
                          <td colSpan={canMarkupView && canDiscountView ? 5 : canMarkupView || canDiscountView ? 4 : 3} />
                          <td className="num">{money(gTotal)}</td>
                          <td colSpan={(canCost ? 1 : 0) + (canMargin ? 1 : 0) + (readOnly ? 0 : 1)} />
                        </tr>
                        {g.lines.map((l) => {
                          const t = lineTotals(l, estimate);
                          return (
                            <tr key={l.id}>
                              <td className="code">{l.code}</td>
                              <td>
                                {readOnly || l.catalogItemId ? (
                                  <span>{l.title}</span>
                                ) : (
                                  <TextInput className="compact" value={l.title} onChange={(v) => patchLine(l.id, { title: v })} />
                                )}
                                {l.qtyAuto && <span className="tag" style={{ marginLeft: 6 }}>авто: {QTY_BASIS_SHORT[l.qtyBasis]}</span>}
                                {l.note && <div className="xsmall muted">{l.note}</div>}
                              </td>
                              <td className="muted small">{l.unit}</td>
                              <td className="num">
                                {readOnly ? num(l.qty) : (
                                  <NumInput
                                    className="compact"
                                    value={l.qty}
                                    onChange={(v) => patchLine(l.id, { qty: v, qtyAuto: false })}
                                  />
                                )}
                              </td>
                              <td className="num">
                                {readOnly ? money(l.basePrice) : (
                                  <NumInput className="compact" value={l.basePrice} onChange={(v) => patchLine(l.id, { basePrice: v })} />
                                )}
                              </td>
                              {canMarkupView && (
                                <td className="num">
                                  {canMarkupEdit && !readOnly ? (
                                    <NumInput
                                      className="compact"
                                      value={l.markupPct ?? estimate.markupPct}
                                      onChange={(v) => patchLine(l.id, { markupPct: v })}
                                      title="Наценка по строке"
                                    />
                                  ) : <span className="muted">{pct(t.markupPct)}</span>}
                                </td>
                              )}
                              {canDiscountView && (
                                <td className="num">
                                  {canDiscountEdit && !readOnly ? (
                                    <NumInput
                                      className="compact"
                                      value={l.discountPct ?? estimate.discountPct}
                                      onChange={(v) => patchLine(l.id, { discountPct: v })}
                                      title="Скидка по строке"
                                    />
                                  ) : <span className="muted">{pct(t.discountPct)}</span>}
                                </td>
                              )}
                              <td className="num strong">{money(t.total)}</td>
                              {canCost && <td className="num muted">{money(t.cost)}</td>}
                              {canMargin && <td className={`num ${t.margin >= 0 ? 'pos' : 'neg'}`}>{money(t.margin)}</td>}
                              {!readOnly && (
                                <td>
                                  <div className="row-actions">
                                    <button className="btn ghost xs" title="Удалить строку" onClick={() => setConfirmDelete(l)}>✕</button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ───────── Боковая панель: живой итог ───────── */}
        <aside className="estimate-side">
          <div className="card total-box">
            <div className="total-label">Итого по смете</div>
            <div className="total-value">{money(totals!.total)}</div>
            <div className="xsmall muted mt-8">
              {estimate.lines.length} строк · {object.area ? `${object.area} м² объекта` : `${rooms.length} помещений`}
              {object.area ? ` · ${money(totals!.total / Math.max(1, object.area))}/м²` : ''}
            </div>

            <div className="mt-12">
              <div className="total-line"><span className="muted">По прайсу</span><span className="v">{money(totals!.base)}</span></div>
              {canMarkupView && (
                <div className="total-line"><span className="muted">Наценка</span><span className="v pos">+{money(totals!.markupAmount)}</span></div>
              )}
              {canDiscountView && (
                <div className="total-line"><span className="muted">Скидка</span><span className="v neg">−{money(totals!.discountAmount)}</span></div>
              )}
              {canCost && (
                <div className="total-line"><span className="muted">Себестоимость</span><span className="v">{money(totals!.cost)}</span></div>
              )}
              {canMargin && (
                <>
                  <div className="total-line"><span className="muted">Маржа</span><span className="v strong">{money(totals!.margin)}</span></div>
                  <div className="total-line"><span className="muted">Рентабельность</span><span className="v">{pct(totals!.marginPct)}</span></div>
                </>
              )}
              <div className="total-line big"><span>К оплате</span><span className="v">{money(totals!.total)}</span></div>
            </div>
          </div>

          {(canMarkupView || canDiscountView) && (
            <Card title="Наценка и скидка" bodyClass="tight">
              {canMarkupView && (
                <div className="mb-12">
                  <div className="flex justify-between items-center mb-8">
                    <span className="small muted">Наценка на смету</span>
                    <span className="strong mono">{pct(estimate.markupPct)}</span>
                  </div>
                  <input
                    type="range" min={0} max={60} step={1} value={estimate.markupPct}
                    disabled={!canMarkupEdit || readOnly}
                    onChange={(e) => patch((x) => { x.markupPct = Number(e.target.value); })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              {canDiscountView && (
                <div className="mb-12">
                  <div className="flex justify-between items-center mb-8">
                    <span className="small muted">Скидка клиенту</span>
                    <span className="strong mono">{pct(estimate.discountPct)}</span>
                  </div>
                  <input
                    type="range" min={0} max={30} step={0.5} value={estimate.discountPct}
                    disabled={!canDiscountEdit || readOnly}
                    onChange={(e) => patch((x) => { x.discountPct = Number(e.target.value); })}
                    style={{ width: '100%' }}
                  />
                  {currentUser?.limits?.maxDiscountPct != null && (
                    <div className="xsmall muted mt-8">Ваш лимит без согласования: {pct(currentUser.limits.maxDiscountPct)}</div>
                  )}
                </div>
              )}
              <div className="row">
                <label className="field grow mb-0">
                  <span className="lbl">Округлять итог до</span>
                  <select
                    className="compact"
                    value={estimate.roundTo}
                    disabled={readOnly}
                    onChange={(e) => patch((x) => { x.roundTo = Number(e.target.value); })}
                  >
                    <option value={0}>не округлять</option>
                    <option value={10}>10 ₽</option>
                    <option value={100}>100 ₽</option>
                    <option value={1000}>1 000 ₽</option>
                  </select>
                </label>
              </div>
            </Card>
          )}

          <Card title="По помещениям" bodyClass="tight">
            {roomTotals.length === 0 && <div className="small muted">Пока нет строк</div>}
            {roomTotals.map((r) => {
              const share = totals!.total > 0 ? (r.total / totals!.total) * 100 : 0;
              return (
                <div key={r.room?.id ?? 'common'} className="mb-8">
                  <div className="flex justify-between small">
                    <span>{r.room?.name ?? 'Общие работы'}</span>
                    <span className="mono strong">{money(r.total)}</span>
                  </div>
                  <div className="progress mt-8"><div style={{ width: `${share}%` }} /></div>
                </div>
              );
            })}
          </Card>

          {!readOnly && (
            <Card title="Действия" bodyClass="tight">
              <button
                className="btn block sm mb-8"
                onClick={() => {
                  patch((e) => { const n = recalcAutoQty(e, rooms, db.catalog); toast(`Пересчитано строк: ${n}`, 'success'); });
                }}
              >
                🔄 Пересчитать объёмы по габаритам
              </button>
              <button
                className="btn block sm"
                onClick={() => {
                  patch((e) => { const n = refreshPrices(e, db.catalog); toast(`Обновлено цен: ${n}`, 'success'); });
                }}
              >
                💰 Обновить цены из прайса
              </button>
            </Card>
          )}
        </aside>
      </div>

      {showPicker && (
        <WorkPicker
          rooms={rooms}
          activeRoomId={activeRoomId}
          onAdd={(item) => addItem(item)}
          onAddBundle={onAddBundle}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showRooms && (
        <RoomsEditor
          rooms={rooms}
          objectTitle={object.title}
          onChange={applyRooms}
          onClose={() => setShowRooms(false)}
        />
      )}

      {confirmDelete && (
        <Confirm
          title="Удалить строку?"
          message={`«${confirmDelete.title}» будет удалена из сметы.`}
          onConfirm={() => patch((e) => { e.lines = e.lines.filter((l) => l.id !== confirmDelete.id); })}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {showApprove && (
        <ApproveDialog
          estimate={estimate}
          onClose={() => setShowApprove(false)}
          onDecision={(ok, reason) => { approve(ok, reason); setShowApprove(false); }}
        />
      )}
    </>
  );
}

function ApproveDialog({ estimate, onClose, onDecision }: {
  estimate: Estimate; onClose: () => void; onDecision: (ok: boolean, reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const t = estimateTotals(estimate);
  return (
    <Modal
      title="Согласование сметы"
      onClose={onClose}
      footer={<>
        <button className="btn danger" onClick={() => onDecision(false, reason)}>Отклонить</button>
        <button className="btn success" onClick={() => onDecision(true)}>Утвердить</button>
      </>}
    >
      <div className="grid cols-2 mb-16">
        <div><span className="muted small">Сумма для клиента</span><div className="strong" style={{ fontSize: 20 }}>{money(t.total)}</div></div>
        <div><span className="muted small">Маржа</span><div className="strong" style={{ fontSize: 20 }}>{money(t.margin)} · {pct(t.marginPct)}</div></div>
      </div>
      <div className="grid cols-2 mb-16">
        <div><span className="muted small">Наценка</span><div>{pct(estimate.markupPct)}</div></div>
        <div><span className="muted small">Скидка</span><div>{pct(estimate.discountPct)}</div></div>
      </div>
      <label className="field">
        <span className="lbl">Причина отклонения (если отклоняете)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: скидка выше допустимой, пересогласуйте с клиентом" />
      </label>
    </Modal>
  );
}
