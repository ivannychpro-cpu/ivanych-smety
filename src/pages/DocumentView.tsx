import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { Empty } from '../components/ui';
import { money2, num, pct } from '../lib/money';
import { estimateTotals, lineTotals } from '../lib/calc';
import { roomGeometry } from '../lib/geometry';
import { ACT_TITLES, actMail, amountLine, clientRequisites, companyRequisites, contractMail, estimateMail, formatRuDate, mailLink } from '../lib/docs';
import { download } from '../lib/csv';

/**
 * Печатные формы: смета, договор, акт.
 * Данные клиента и объекта подставляются из карточек — вводятся один раз.
 */
export default function DocumentView() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { db, can } = useApp();

  const content = useMemo(() => {
    if (kind === 'estimate') {
      const e = db.estimates.find((x) => x.id === id);
      if (!e) return null;
      return {
        title: `Смета ${e.number}`,
        mail: estimateMail(e, db.clients.find((c) => c.id === e.clientId), db.objects.find((o) => o.id === e.objectId), db.settings),
        node: <EstimateDoc estimateId={e.id} />,
      };
    }
    if (kind === 'contract') {
      const c = db.contracts.find((x) => x.id === id);
      if (!c) return null;
      return {
        title: `Договор ${c.number}`,
        mail: contractMail(c, db.clients.find((x) => x.id === c.clientId), db.settings),
        node: <ContractDoc contractId={c.id} />,
      };
    }
    if (kind === 'act') {
      const a = db.acts.find((x) => x.id === id);
      if (!a) return null;
      return {
        title: `${ACT_TITLES[a.kind]} № ${a.number}`,
        mail: actMail(a, db.clients.find((x) => x.id === db.contracts.find((c) => c.id === a.contractId)?.clientId), db.settings),
        node: <ActDoc actId={a.id} />,
      };
    }
    return null;
  }, [kind, id, db]);

  if (!content) return <Empty icon="📄" title="Документ не найден" action={<Link className="btn" to="/">На главную</Link>} />;

  return (
    <>
      <div className="page-head no-print">
        <div><h1>{content.title}</h1><p>Печатная форма. Данные подставлены из карточек клиента и объекта.</p></div>
        <div className="spacer" />
        <div className="flex gap-8 wrap">
          <button className="btn" onClick={() => window.print()}>🖨 Печать / PDF</button>
          <button
            className="btn"
            onClick={() => {
              const html = document.querySelector('.doc-preview')?.outerHTML ?? '';
              download(`${content.title}.html`,
                `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${content.title}</title>
<style>body{font-family:Arial,sans-serif;font-size:13px;line-height:1.5;padding:30px}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th,td{border:1px solid #98a2b3;padding:5px 7px}th{background:#eef2f7;text-align:left}h1{font-size:17px;text-align:center}h2{font-size:14px;margin:18px 0 8px}.sign-row{display:flex;gap:40px;margin-top:28px}.sign-row>div{flex:1}.num{text-align:right}</style>
</head><body>${html}</body></html>`, 'text/html;charset=utf-8');
            }}
          >
            ⬇ Скачать
          </button>
          {can('document.send') && content.mail.to && (
            <a className="btn primary" href={mailLink(content.mail)}>✉ Отправить клиенту</a>
          )}
        </div>
      </div>

      {can('document.send') && !content.mail.to && (
        <div className="note warn mb-12 no-print">У клиента не заполнен e-mail — отправка недоступна. Добавьте почту в карточке клиента.</div>
      )}

      {content.node}
    </>
  );
}

/* ─────────────── Смета ─────────────── */

function EstimateDoc({ estimateId }: { estimateId: string }) {
  const { db, can } = useApp();
  const e = db.estimates.find((x) => x.id === estimateId)!;
  const object = db.objects.find((o) => o.id === e.objectId);
  const client = db.clients.find((c) => c.id === e.clientId);
  const t = estimateTotals(e);
  const showDiscount = can('estimate.discount.view') && e.discountPct > 0;

  const groups = (object?.rooms ?? [])
    .map((r) => ({ room: r, lines: e.lines.filter((l) => l.roomId === r.id).sort((a, b) => a.order - b.order) }))
    .filter((g) => g.lines.length > 0);
  const common = e.lines.filter((l) => !l.roomId || !(object?.rooms ?? []).some((r) => r.id === l.roomId));

  let idx = 0;

  return (
    <div className="doc-preview">
      <h1>СМЕТА № {e.number}</h1>
      <div className="center" style={{ marginBottom: 14 }}>от {formatRuDate(e.createdAt)}</div>

      <table>
        <tbody>
          <tr><th style={{ width: '25%' }}>Заказчик</th><td>{client?.fullName ?? '—'}{client?.phone ? `, тел. ${client.phone}` : ''}</td></tr>
          <tr><th>Объект</th><td>{object?.title ?? '—'}, {object?.address ?? ''}</td></tr>
          <tr><th>Площадь объекта</th><td>{object?.area ? `${object.area} м²` : '—'}</td></tr>
          <tr><th>Исполнитель</th><td>{db.settings.legalName}, тел. {db.settings.phone}</td></tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>№</th>
            <th style={{ width: 60 }}>Код</th>
            <th>Наименование работ</th>
            <th style={{ width: 46 }}>Ед.</th>
            <th style={{ width: 62 }} className="num">Кол-во</th>
            <th style={{ width: 80 }} className="num">Цена, ₽</th>
            <th style={{ width: 90 }} className="num">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const geo = roomGeometry(g.room);
            return [
              <tr key={g.room.id}>
                <td colSpan={7} style={{ background: '#f4f6f9', fontWeight: 600 }}>
                  {g.room.name} — пол {num(geo.floor)} м², стены {num(geo.walls)} м², периметр {num(geo.perimeter)} м
                </td>
              </tr>,
              ...g.lines.map((l) => {
                idx += 1;
                const lt = lineTotals(l, e);
                return (
                  <tr key={l.id}>
                    <td>{idx}</td>
                    <td>{l.code}</td>
                    <td>{l.title}</td>
                    <td>{l.unit}</td>
                    <td className="num">{num(l.qty)}</td>
                    <td className="num">{money2(lt.unitPrice)}</td>
                    <td className="num">{money2(lt.total)}</td>
                  </tr>
                );
              }),
            ];
          })}
          {common.length > 0 && (
            <tr><td colSpan={7} style={{ background: '#f4f6f9', fontWeight: 600 }}>Общие работы по объекту</td></tr>
          )}
          {common.map((l) => {
            idx += 1;
            const lt = lineTotals(l, e);
            return (
              <tr key={l.id}>
                <td>{idx}</td><td>{l.code}</td><td>{l.title}</td><td>{l.unit}</td>
                <td className="num">{num(l.qty)}</td><td className="num">{money2(lt.unitPrice)}</td><td className="num">{money2(lt.total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {showDiscount && (
            <tr>
              <td colSpan={6} className="num">Скидка {pct(e.discountPct)}</td>
              <td className="num">−{money2(t.discountAmount)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={6} className="num" style={{ fontWeight: 700 }}>ИТОГО</td>
            <td className="num" style={{ fontWeight: 700 }}>{money2(t.total)}</td>
          </tr>
        </tfoot>
      </table>

      <p><b>Всего по смете:</b> {amountLine(t.total)}</p>
      <p className="small">
        Смета составлена на основании замера от {formatRuDate(e.createdAt)}. Стоимость материалов в смету не включена,
        если иное не указано в строках. Смета действительна 14 календарных дней.
      </p>

      <div className="sign-row">
        <div>
          <div><b>Исполнитель</b></div>
          <div>{db.settings.legalName}</div>
          <div style={{ marginTop: 26 }}>______________ / {db.settings.director} /</div>
        </div>
        <div>
          <div><b>Заказчик</b></div>
          <div>{client?.fullName ?? '—'}</div>
          <div style={{ marginTop: 26 }}>______________ / ______________ /</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Договор ─────────────── */

function ContractDoc({ contractId }: { contractId: string }) {
  const { db } = useApp();
  const c = db.contracts.find((x) => x.id === contractId)!;
  const client = db.clients.find((x) => x.id === c.clientId);
  const object = db.objects.find((x) => x.id === c.objectId);
  const estimate = db.estimates.find((x) => x.id === c.estimateId);
  const s = db.settings;

  return (
    <div className="doc-preview">
      <h1>ДОГОВОР ПОДРЯДА № {c.number}</h1>
      <div className="flex justify-between" style={{ marginBottom: 16 }}>
        <span>{s.address.split(',')[0]}</span>
        <span>{formatRuDate(c.date)}</span>
      </div>

      <p>
        {s.legalName}, именуемое в дальнейшем «Подрядчик», в лице директора {s.director},
        действующего на основании {s.directorBasis}, с одной стороны, и {client?.fullName ?? '_____________'},
        именуемый(ая) в дальнейшем «Заказчик», с другой стороны, заключили настоящий Договор о нижеследующем.
      </p>

      <h2>1. Предмет договора</h2>
      <p>
        1.1. Подрядчик обязуется выполнить ремонтно-отделочные работы на объекте Заказчика по адресу:
        {' '}{object?.address ?? '_____________'}{object?.area ? `, общей площадью ${object.area} м²` : ''}, а Заказчик — принять и оплатить их.
      </p>
      <p>
        1.2. Объём и стоимость работ определяются Сметой {estimate ? `№ ${estimate.number}` : '№ ____'},
        которая является неотъемлемым приложением к настоящему Договору (Приложение № 1).
      </p>

      <h2>2. Стоимость и порядок расчётов</h2>
      <p>2.1. Общая стоимость работ составляет {amountLine(c.amount)}.</p>
      <p>2.2. Оплата производится поэтапно:</p>
      <table>
        <thead><tr><th style={{ width: 34 }}>№</th><th>Этап</th><th style={{ width: 120 }} className="num">Сумма, ₽</th><th style={{ width: 110 }} className="num">Срок</th></tr></thead>
        <tbody>
          {c.payments.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td><td>{p.title}</td>
              <td className="num">{money2(p.amount)}</td>
              <td className="num">{p.dueDate ? formatRuDate(p.dueDate) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.terms?.prepaymentPct != null && <p>2.3. Аванс составляет {c.terms.prepaymentPct}% от стоимости работ.</p>}

      <h2>3. Сроки выполнения работ</h2>
      <p>
        3.1. Начало работ: {formatRuDate(c.startDate)}. Окончание работ: {formatRuDate(c.endDate)}.
      </p>
      <p>
        3.2. Сроки продлеваются соразмерно задержке предоставления Заказчиком материалов, доступа на объект
        или согласования решений.
      </p>

      <h2>4. Порядок сдачи и приёмки работ</h2>
      <p>4.1. Приёмка выполненных работ оформляется Актом выполненных работ по этапам.</p>
      <p>4.2. Скрытые работы оформляются актом освидетельствования скрытых работ.</p>
      <p>4.3. Дополнительные работы, не учтённые Сметой, выполняются по отдельной смете и оформляются актом на дополнительные работы.</p>

      <h2>5. Гарантии и ответственность</h2>
      <p>5.1. Гарантийный срок на выполненные работы — {c.terms?.warrantyMonths ?? 24} месяцев с даты подписания акта.</p>
      <p>5.2. За нарушение сроков сторона уплачивает пеню {c.terms?.penaltyPctPerDay ?? 0.1}% от стоимости этапа за каждый день просрочки.</p>

      <h2>6. Реквизиты и подписи сторон</h2>
      <div className="sign-row">
        <div>
          <div><b>Подрядчик</b></div>
          {companyRequisites(s).map((l) => <div key={l}>{l}</div>)}
          <div style={{ marginTop: 26 }}>______________ / {s.director} /</div>
        </div>
        <div>
          <div><b>Заказчик</b></div>
          {clientRequisites(client).map((l) => <div key={l}>{l}</div>)}
          <div style={{ marginTop: 26 }}>______________ / {client?.fullName ?? ''} /</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Акт ─────────────── */

function ActDoc({ actId }: { actId: string }) {
  const { db } = useApp();
  const a = db.acts.find((x) => x.id === actId)!;
  const contract = db.contracts.find((c) => c.id === a.contractId);
  const client = db.clients.find((c) => c.id === contract?.clientId);
  const object = db.objects.find((o) => o.id === contract?.objectId);
  const s = db.settings;

  return (
    <div className="doc-preview">
      <h1>{ACT_TITLES[a.kind].toUpperCase()} № {a.number}</h1>
      <div className="center" style={{ marginBottom: 14 }}>
        к Договору № {contract?.number ?? '___'} от {formatRuDate(contract?.date)} · {formatRuDate(a.date)}
      </div>

      <p>
        {s.legalName} («Подрядчик») в лице директора {s.director} и {client?.fullName ?? '___'} («Заказчик»)
        составили настоящий акт о том, что на объекте по адресу {object?.address ?? '___'} выполнены следующие работы:
      </p>

      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>№</th><th style={{ width: 60 }}>Код</th><th>Наименование работ</th>
            <th style={{ width: 46 }}>Ед.</th><th style={{ width: 62 }} className="num">Кол-во</th>
            <th style={{ width: 80 }} className="num">Цена, ₽</th><th style={{ width: 90 }} className="num">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          {a.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td><td>{l.code}</td><td>{l.title}</td><td>{l.unit}</td>
              <td className="num">{num(l.qty)}</td><td className="num">{money2(l.price)}</td>
              <td className="num">{money2(l.qty * l.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={6} className="num" style={{ fontWeight: 700 }}>ИТОГО</td><td className="num" style={{ fontWeight: 700 }}>{money2(a.amount)}</td></tr>
        </tfoot>
      </table>

      <p><b>Всего выполнено работ на сумму:</b> {amountLine(a.amount)}</p>
      <p>
        Работы выполнены в полном объёме и в срок. Заказчик претензий по объёму, качеству и срокам
        выполнения работ не имеет.
      </p>

      <div className="sign-row">
        <div>
          <div><b>Подрядчик</b></div>
          <div>{s.legalName}</div>
          <div style={{ marginTop: 26 }}>______________ / {s.director} /</div>
        </div>
        <div>
          <div><b>Заказчик</b></div>
          <div>{client?.fullName ?? '—'}</div>
          <div style={{ marginTop: 26 }}>______________ / ______________ /</div>
        </div>
      </div>
    </div>
  );
}
