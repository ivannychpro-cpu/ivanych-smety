import { useRef, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Card, Empty, Field, NumInput, TextInput } from '../../components/ui';
import { download } from '../../lib/csv';
import { exportDB } from '../../store/db';

/** Реквизиты компании, правила ценообразования и обслуживание базы. */
export default function Settings() {
  const { db, update, can, reset, importDB, toast } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!can('admin.settings')) return <Empty icon="🔒" title="Раздел недоступен" />;

  const s = db.settings;
  const set = (p: Partial<typeof s>) => update((draft) => { draft.settings = { ...draft.settings, ...p }; });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Настройки компании</h1>
          <p>Эти реквизиты подставляются во все договоры и акты.</p>
        </div>
      </div>

      <div className="grid cols-2">
        <Card title="Реквизиты">
          <Field label="Краткое название"><TextInput value={s.name} onChange={(v) => set({ name: v })} /></Field>
          <Field label="Полное наименование"><TextInput value={s.legalName} onChange={(v) => set({ legalName: v })} /></Field>
          <div className="grid cols-3">
            <Field label="ИНН"><TextInput value={s.inn} onChange={(v) => set({ inn: v })} /></Field>
            <Field label="КПП"><TextInput value={s.kpp ?? ''} onChange={(v) => set({ kpp: v })} /></Field>
            <Field label="ОГРН"><TextInput value={s.ogrn ?? ''} onChange={(v) => set({ ogrn: v })} /></Field>
          </div>
          <Field label="Адрес"><TextInput value={s.address} onChange={(v) => set({ address: v })} /></Field>
          <div className="grid cols-2">
            <Field label="Телефон"><TextInput value={s.phone} onChange={(v) => set({ phone: v })} /></Field>
            <Field label="E-mail"><TextInput value={s.email} onChange={(v) => set({ email: v })} /></Field>
          </div>
          <div className="grid cols-3">
            <Field label="Банк"><TextInput value={s.bank ?? ''} onChange={(v) => set({ bank: v })} /></Field>
            <Field label="БИК"><TextInput value={s.bik ?? ''} onChange={(v) => set({ bik: v })} /></Field>
            <Field label="Расчётный счёт"><TextInput value={s.account ?? ''} onChange={(v) => set({ account: v })} /></Field>
          </div>
          <div className="grid cols-2">
            <Field label="Директор"><TextInput value={s.director} onChange={(v) => set({ director: v })} /></Field>
            <Field label="Действует на основании"><TextInput value={s.directorBasis} onChange={(v) => set({ directorBasis: v })} /></Field>
          </div>
        </Card>

        <div>
          <Card title="Ценообразование">
            <Field label="Наценка по умолчанию для новых смет, %" hint="подставляется при создании сметы">
              <NumInput value={s.defaultMarkupPct} onChange={(v) => set({ defaultMarkupPct: v })} />
            </Field>
            <Field label="Максимальная скидка без согласования, %" hint="ориентир для руководителя при проверке смет">
              <NumInput value={s.maxDiscountWithoutApproval} onChange={(v) => set({ maxDiscountWithoutApproval: v })} />
            </Field>
          </Card>

          <Card title="База данных" className="mt-16">
            <p className="small muted">
              Сейчас данные хранятся в браузере этого устройства. Выгружайте резервную копию,
              чтобы перенести их на другой компьютер или подключить серверную версию.
            </p>
            <div className="flex gap-8 wrap">
              <button
                className="btn"
                onClick={() => download(`иваныч-база-${new Date().toISOString().slice(0, 10)}.json`, exportDB(db), 'application/json')}
              >
                ⬇ Выгрузить базу
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Загрузить базу</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const res = importDB(await f.text());
                  toast(res.ok ? 'База загружена' : `Ошибка: ${res.error}`, res.ok ? 'success' : 'error');
                }}
              />
              <button className="btn danger" onClick={() => setConfirmReset(true)}>Сбросить к демо-данным</button>
            </div>
            {confirmReset && (
              <div className="note danger mt-12">
                Все внесённые данные будут удалены и заменены демонстрационными.
                <div className="flex gap-8 mt-8">
                  <button className="btn sm" onClick={() => setConfirmReset(false)}>Отмена</button>
                  <button className="btn sm danger" onClick={() => { reset(); setConfirmReset(false); }}>Да, сбросить</button>
                </div>
              </div>
            )}
          </Card>

          <Card title="Что хранится" className="mt-16" bodyClass="tight">
            <div className="table-wrap">
              <table className="tbl compact">
                <tbody>
                  <tr><td>Сотрудники</td><td className="num">{db.users.length}</td></tr>
                  <tr><td>Позиции прайса</td><td className="num">{db.catalog.length}</td></tr>
                  <tr><td>Наборы работ</td><td className="num">{db.bundles.length}</td></tr>
                  <tr><td>Клиенты</td><td className="num">{db.clients.length}</td></tr>
                  <tr><td>Объекты</td><td className="num">{db.objects.length}</td></tr>
                  <tr><td>Сметы</td><td className="num">{db.estimates.length}</td></tr>
                  <tr><td>Договоры</td><td className="num">{db.contracts.length}</td></tr>
                  <tr><td>Акты</td><td className="num">{db.acts.length}</td></tr>
                  <tr><td>Брифы замеров</td><td className="num">{db.briefs.length}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
