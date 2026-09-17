import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Estimate } from '../domain/types';
import { Badge, Card, Empty, Field, Modal, NumInput, TextInput, formatDate } from '../components/ui';
import { money } from '../lib/money';
import { estimateTotals } from '../lib/calc';
import { emptyEstimate } from '../lib/estimateOps';
import { mkId, nextNumber } from '../lib/id';

const STATUS_LABEL: Record<Estimate['status'], string> = {
  draft: 'Черновик', onApproval: 'На согласовании', approved: 'Утверждена',
  rejected: 'Отклонена', sent: 'Отправлена', signed: 'Подписана', archived: 'Архив',
};
const STATUS_KIND: Record<Estimate['status'], 'blue' | 'green' | 'amber' | 'red' | 'purple' | undefined> = {
  draft: undefined, onApproval: 'amber', approved: 'green', rejected: 'red', sent: 'blue', signed: 'purple', archived: undefined,
};

export default function EstimateList() {
  const { db, can, currentUser } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Estimate['status']>('all');
  const [showNew, setShowNew] = useState(false);

  const canSeeAll = can('estimate.view.all');
  const canCost = can('estimate.margin.view');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.estimates
      .filter((e) => canSeeAll || e.authorId === currentUser?.id)
      .filter((e) => status === 'all' || e.status === status)
      .filter((e) => {
        if (!q) return true;
        const obj = db.objects.find((o) => o.id === e.objectId);
        const cli = db.clients.find((c) => c.id === e.clientId);
        return `${e.number} ${e.title} ${obj?.title ?? ''} ${cli?.fullName ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [db.estimates, db.objects, db.clients, query, status, canSeeAll, currentUser]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Сметы</h1>
          <p>{canSeeAll ? 'Все сметы компании' : 'Ваши сметы'} · найдено {list.length}</p>
        </div>
        <div className="spacer" />
        {can('estimate.create') && <button className="btn primary" onClick={() => setShowNew(true)}>+ Новая смета</button>}
      </div>

      <Card bodyClass="tight">
        <div className="row mb-12">
          <div className="grow" style={{ minWidth: 220 }}>
            <input type="search" placeholder="Поиск по номеру, объекту, клиенту…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select style={{ width: 200 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">Все статусы</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {list.length === 0 ? (
          <Empty icon="🧮" title="Смет пока нет" hint="Создайте первую смету — это займёт пару минут." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Объект и клиент</th>
                  <th>Автор</th>
                  <th>Статус</th>
                  <th className="num">Строк</th>
                  <th className="num">Сумма</th>
                  {canCost && <th className="num">Маржа</th>}
                  <th className="num">Изменена</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const t = estimateTotals(e);
                  const obj = db.objects.find((o) => o.id === e.objectId);
                  const cli = db.clients.find((c) => c.id === e.clientId);
                  const author = db.users.find((u) => u.id === e.authorId);
                  return (
                    <tr key={e.id}>
                      <td className="nowrap"><Link to={`/estimates/${e.id}`} className="strong">{e.number}</Link></td>
                      <td>
                        <div>{obj?.title ?? '—'}</div>
                        <div className="xsmall muted">{cli?.fullName ?? '—'}</div>
                      </td>
                      <td className="small">{author?.fullName ?? '—'}</td>
                      <td><Badge kind={STATUS_KIND[e.status]}>{STATUS_LABEL[e.status]}</Badge></td>
                      <td className="num">{e.lines.length}</td>
                      <td className="num strong">{money(t.total)}</td>
                      {canCost && <td className={`num ${t.margin >= 0 ? 'pos' : 'neg'}`}>{money(t.margin)}</td>}
                      <td className="num small muted">{formatDate(e.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showNew && <NewEstimateDialog onClose={() => setShowNew(false)} />}
    </>
  );
}

function NewEstimateDialog({ onClose }: { onClose: () => void }) {
  const { db, update, currentUser, toast } = useApp();
  const nav = useNavigate();

  const [mode, setMode] = useState<'existing' | 'new'>(db.objects.length ? 'existing' : 'new');
  const [objectId, setObjectId] = useState(db.objects[0]?.id ?? '');
  const [title, setTitle] = useState('Смета на ремонт');

  // Быстрое заведение клиента и объекта прямо из сметы — сценарий замерщика на объекте.
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [objTitle, setObjTitle] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState(0);
  const [height, setHeight] = useState(2.7);
  const [roomCount, setRoomCount] = useState(3);

  const create = () => {
    const estId = mkId('est-');
    update((draft) => {
      let objId = objectId;
      let cliId = draft.objects.find((o) => o.id === objectId)?.clientId ?? '';

      if (mode === 'new') {
        const client = {
          id: mkId('cli-'), type: 'person' as const, fullName: clientName || 'Новый клиент',
          phone: clientPhone, email: clientEmail, address,
          managerId: currentUser?.id, createdAt: new Date().toISOString(),
        };
        draft.clients.unshift(client);
        cliId = client.id;

        const side = area > 0 ? Math.sqrt(area / Math.max(1, roomCount)) : 3.5;
        const obj = {
          id: mkId('obj-'), clientId: client.id, title: objTitle || `Объект: ${address || clientName}`,
          address, area, ceilingHeight: height,
          measurerId: currentUser?.id, status: 'measured' as const, createdAt: new Date().toISOString(),
          rooms: Array.from({ length: Math.max(1, roomCount) }, (_, i) => ({
            id: mkId('rm-'), name: `Помещение ${i + 1}`,
            length: Math.round(side * 100) / 100, width: Math.round(side * 100) / 100,
            height, doors: 1, windows: 1,
          })),
        };
        draft.objects.unshift(obj);
        objId = obj.id;
      }

      const est = emptyEstimate({
        number: nextNumber('СМ', draft.estimates.map((e) => e.number)),
        objectId: objId,
        clientId: cliId,
        authorId: currentUser!.id,
        title,
        markupPct: draft.settings.defaultMarkupPct,
      });
      est.id = estId;
      draft.estimates.unshift(est);
    }, { action: 'estimate.create', entity: 'estimate', entityId: estId });

    toast('Смета создана', 'success');
    nav(`/estimates/${estId}`);
  };

  const valid = mode === 'existing' ? !!objectId : (!!clientName && !!address);

  return (
    <Modal
      title="Новая смета"
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!valid} onClick={create}>Создать и открыть калькулятор</button>
      </>}
    >
      <div className="btn-group mb-16">
        <button className={`btn ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')}>По существующему объекту</button>
        <button className={`btn ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>Новый клиент и объект</button>
      </div>

      <Field label="Название сметы">
        <TextInput value={title} onChange={setTitle} placeholder="Ремонт под ключ, 2-комнатная квартира" />
      </Field>

      {mode === 'existing' ? (
        <Field label="Объект">
          <select value={objectId} onChange={(e) => setObjectId(e.target.value)}>
            {db.objects.map((o) => {
              const c = db.clients.find((x) => x.id === o.clientId);
              return <option key={o.id} value={o.id}>{o.title} — {c?.fullName ?? '—'}</option>;
            })}
          </select>
        </Field>
      ) : (
        <>
          <div className="grid cols-2">
            <Field label="Клиент (ФИО)"><TextInput value={clientName} onChange={setClientName} placeholder="Иванов Иван Иванович" /></Field>
            <Field label="Телефон"><TextInput value={clientPhone} onChange={setClientPhone} placeholder="+7 (900) 000-00-00" /></Field>
          </div>
          <div className="grid cols-2">
            <Field label="E-mail" hint="Понадобится для отправки документов"><TextInput value={clientEmail} onChange={setClientEmail} placeholder="client@mail.ru" /></Field>
            <Field label="Название объекта"><TextInput value={objTitle} onChange={setObjTitle} placeholder="Квартира, ЖК «Северный»" /></Field>
          </div>
          <Field label="Адрес объекта"><TextInput value={address} onChange={setAddress} placeholder="г. Москва, ул. ..., д. ..., кв. ..." /></Field>
          <div className="grid cols-3">
            <Field label="Общая площадь, м²"><NumInput value={area} onChange={setArea} /></Field>
            <Field label="Высота потолков, м"><NumInput value={height} onChange={setHeight} /></Field>
            <Field label="Количество помещений" hint="Габариты уточните в калькуляторе"><NumInput value={roomCount} onChange={setRoomCount} /></Field>
          </div>
        </>
      )}
    </Modal>
  );
}
