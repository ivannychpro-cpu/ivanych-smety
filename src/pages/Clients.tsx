import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Client } from '../domain/types';
import { Badge, Card, Empty, Field, Modal, Select, TextInput, formatDate } from '../components/ui';
import { money } from '../lib/money';
import { estimateTotals } from '../lib/calc';
import { mkId } from '../lib/id';

/**
 * Карточка клиента — единственное место, где вводятся его данные.
 * Дальше они подтягиваются в смету, договор и все акты по его объектам.
 */
export default function Clients() {
  const { db, update, can, currentUser, toast } = useApp();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Client | null>(null);
  const canEdit = can('client.edit');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.clients
      .filter((c) => !q || `${c.fullName} ${c.phone} ${c.email} ${c.address ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db.clients, query]);

  const blank = (): Client => ({
    id: mkId('cli-'), type: 'person', fullName: '', phone: '', email: '',
    managerId: currentUser?.id, createdAt: new Date().toISOString(),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Клиенты</h1>
          <p>{db.clients.length} клиентов. Данные отсюда подставляются во все документы.</p>
        </div>
        <div className="spacer" />
        {canEdit && <button className="btn primary" onClick={() => setEditing(blank())}>+ Клиент</button>}
      </div>

      <Card bodyClass="tight">
        <input className="mb-12" type="search" placeholder="Поиск по ФИО, телефону, адресу…" value={query} onChange={(e) => setQuery(e.target.value)} />

        {list.length === 0 ? <Empty icon="👤" title="Клиентов не найдено" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Клиент</th><th>Контакты</th><th>Объекты</th>
                  <th className="num">Сметы</th><th className="num">Сумма</th><th>Договоры</th><th className="num">Заведён</th>
                  {canEdit && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const objects = db.objects.filter((o) => o.clientId === c.id);
                  const estimates = db.estimates.filter((e) => e.clientId === c.id);
                  const contracts = db.contracts.filter((k) => k.clientId === c.id);
                  const sum = estimates.reduce((s, e) => s + estimateTotals(e).total, 0);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="strong">{c.fullName}</div>
                        <div className="xsmall muted">{c.type === 'company' ? `ИНН ${c.inn ?? '—'}` : 'физическое лицо'}</div>
                      </td>
                      <td className="small">
                        <div>{c.phone}</div>
                        <div className="muted xsmall">{c.email}</div>
                      </td>
                      <td className="small">
                        {objects.map((o) => <div key={o.id}><Link to="/objects">{o.title}</Link></div>)}
                        {objects.length === 0 && <span className="muted">—</span>}
                      </td>
                      <td className="num">{estimates.length}</td>
                      <td className="num strong">{money(sum)}</td>
                      <td className="small">
                        {contracts.map((k) => <div key={k.id}>{k.number} <Badge>{k.status === 'inWork' ? 'в работе' : k.status}</Badge></div>)}
                        {contracts.length === 0 && <span className="muted">—</span>}
                      </td>
                      <td className="num small muted">{formatDate(c.createdAt)}</td>
                      {canEdit && (
                        <td><div className="row-actions"><button className="btn ghost xs" onClick={() => setEditing(c)}>✎</button></div></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ClientDialog
          client={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            update((draft) => {
              const idx = draft.clients.findIndex((x) => x.id === c.id);
              if (idx >= 0) draft.clients[idx] = c; else draft.clients.unshift(c);
            }, { action: 'client.save', entity: 'client', entityId: c.id, details: c.fullName });
            setEditing(null);
            toast('Клиент сохранён', 'success');
          }}
        />
      )}
    </>
  );
}

function ClientDialog({ client, onSave, onClose }: { client: Client; onSave: (c: Client) => void; onClose: () => void }) {
  const [d, setD] = useState<Client>(client);
  const set = (p: Partial<Client>) => setD((x) => ({ ...x, ...p }));

  return (
    <Modal
      title={client.fullName || 'Новый клиент'}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!d.fullName} onClick={() => onSave(d)}>Сохранить</button>
      </>}
    >
      <div className="grid cols-2">
        <Field label="Тип">
          <Select value={d.type} onChange={(v) => set({ type: v })} options={[
            { value: 'person', label: 'Физическое лицо' },
            { value: 'company', label: 'Юридическое лицо' },
          ]} />
        </Field>
        <Field label={d.type === 'company' ? 'Наименование организации' : 'ФИО полностью'}>
          <TextInput value={d.fullName} onChange={(v) => set({ fullName: v })} />
        </Field>
      </div>
      <div className="grid cols-2">
        <Field label="Телефон"><TextInput value={d.phone} onChange={(v) => set({ phone: v })} /></Field>
        <Field label="E-mail" hint="на него отправляются документы"><TextInput value={d.email} onChange={(v) => set({ email: v })} /></Field>
      </div>
      <Field label="Адрес регистрации / юридический адрес"><TextInput value={d.address ?? ''} onChange={(v) => set({ address: v })} /></Field>

      {d.type === 'person' ? (
        <Field label="Паспортные данные" hint="серия, номер, кем и когда выдан — подставляется в договор">
          <TextInput value={d.passport ?? ''} onChange={(v) => set({ passport: v })} />
        </Field>
      ) : (
        <>
          <div className="grid cols-3">
            <Field label="ИНН"><TextInput value={d.inn ?? ''} onChange={(v) => set({ inn: v })} /></Field>
            <Field label="КПП"><TextInput value={d.kpp ?? ''} onChange={(v) => set({ kpp: v })} /></Field>
            <Field label="ОГРН"><TextInput value={d.ogrn ?? ''} onChange={(v) => set({ ogrn: v })} /></Field>
          </div>
          <div className="grid cols-3">
            <Field label="Банк"><TextInput value={d.bank ?? ''} onChange={(v) => set({ bank: v })} /></Field>
            <Field label="БИК"><TextInput value={d.bik ?? ''} onChange={(v) => set({ bik: v })} /></Field>
            <Field label="Расчётный счёт"><TextInput value={d.account ?? ''} onChange={(v) => set({ account: v })} /></Field>
          </div>
          <Field label="Подписант"><TextInput value={d.signatory ?? ''} onChange={(v) => set({ signatory: v })} /></Field>
        </>
      )}

      <div className="grid cols-2">
        <Field label="Источник обращения"><TextInput value={d.source ?? ''} onChange={(v) => set({ source: v })} placeholder="Сайт, рекомендация, реклама" /></Field>
        <Field label="Комментарий"><TextInput value={d.note ?? ''} onChange={(v) => set({ note: v })} /></Field>
      </div>
    </Modal>
  );
}
