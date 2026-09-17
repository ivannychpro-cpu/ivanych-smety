import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import type { DepartmentCode, Permission, RoleCode, User } from '../../domain/types';
import { DEPARTMENT_TITLES, PERMISSION_GROUPS, effectivePermissions } from '../../domain/permissions';
import { Badge, Card, Empty, Field, Modal, NumInput, Select, TextInput, formatDate } from '../../components/ui';
import { mkId } from '../../lib/id';

/** Сотрудники и их персональные доступы поверх роли. */
export default function Users() {
  const { db, update, can, toast } = useApp();
  const [editing, setEditing] = useState<User | null>(null);
  const [perms, setPerms] = useState<User | null>(null);

  if (!can('admin.users')) return <Empty icon="🔒" title="Раздел недоступен" />;

  const blank = (): User => ({
    id: mkId('usr-'), fullName: '', login: '', email: '', roleCode: 'measurer', departmentCode: 'sales',
    active: true, grantedPermissions: [], revokedPermissions: [], createdAt: new Date().toISOString(),
  });

  const save = (u: User) => {
    update((draft) => {
      const idx = draft.users.findIndex((x) => x.id === u.id);
      if (idx >= 0) draft.users[idx] = u; else draft.users.push(u);
    }, { action: 'user.save', entity: 'user', entityId: u.id, details: u.fullName });
    setEditing(null);
    toast('Сотрудник сохранён', 'success');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Сотрудники</h1>
          <p>{db.users.filter((u) => u.active).length} активных. У каждого — своя роль, кабинет и набор прав.</p>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEditing(blank())}>+ Сотрудник</button>
      </div>

      <Card bodyClass="tight">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Сотрудник</th><th>Роль</th><th>Отдел</th><th>Руководитель</th>
                <th>Лимиты</th><th className="num">Прав</th><th>Статус</th><th className="num">Заведён</th><th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {db.users.map((u) => {
                const eff = effectivePermissions(u, db.roles);
                const role = db.roles.find((r) => r.code === u.roleCode);
                const diff = u.grantedPermissions.length + u.revokedPermissions.length;
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : .55 }}>
                    <td>
                      <div className="strong">{u.fullName}</div>
                      <div className="xsmall muted">{u.email} · {u.login}</div>
                    </td>
                    <td className="small">{role?.title ?? u.roleCode}</td>
                    <td className="small muted">{DEPARTMENT_TITLES[u.departmentCode]}</td>
                    <td className="small muted">{db.users.find((x) => x.id === u.managerId)?.fullName ?? '—'}</td>
                    <td className="xsmall muted">
                      {u.limits?.maxDiscountPct != null && <div>скидка ≤ {u.limits.maxDiscountPct}%</div>}
                      {u.limits?.minMarkupPct != null && <div>наценка ≥ {u.limits.minMarkupPct}%</div>}
                      {!u.limits && '—'}
                    </td>
                    <td className="num">{eff.size}{diff > 0 && <span className="muted xsmall"> ({diff} персон.)</span>}</td>
                    <td>{u.active ? <Badge kind="green">активен</Badge> : <Badge>отключён</Badge>}</td>
                    <td className="num small muted">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost xs" title="Доступы" onClick={() => setPerms(u)}>🔐</button>
                        <button className="btn ghost xs" onClick={() => setEditing(u)}>✎</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <UserDialog user={editing} onSave={save} onClose={() => setEditing(null)} />}
      {perms && <UserPermissionsDialog user={perms} onClose={() => setPerms(null)} />}
    </>
  );
}

function UserDialog({ user, onSave, onClose }: { user: User; onSave: (u: User) => void; onClose: () => void }) {
  const { db } = useApp();
  const [d, setD] = useState<User>(user);
  const set = (p: Partial<User>) => setD((x) => ({ ...x, ...p }));

  return (
    <Modal
      title={user.fullName || 'Новый сотрудник'}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!d.fullName || !d.login} onClick={() => onSave(d)}>Сохранить</button>
      </>}
    >
      <div className="grid cols-2">
        <Field label="ФИО"><TextInput value={d.fullName} onChange={(v) => set({ fullName: v })} /></Field>
        <Field label="Логин"><TextInput value={d.login} onChange={(v) => set({ login: v })} /></Field>
      </div>
      <div className="grid cols-2">
        <Field label="E-mail"><TextInput value={d.email} onChange={(v) => set({ email: v })} /></Field>
        <Field label="Телефон"><TextInput value={d.phone ?? ''} onChange={(v) => set({ phone: v })} /></Field>
      </div>
      <div className="grid cols-3">
        <Field label="Роль" hint="определяет кабинет и базовые права">
          <Select
            value={d.roleCode}
            onChange={(v) => {
              const role = db.roles.find((r) => r.code === v);
              set({ roleCode: v as RoleCode, departmentCode: role?.department ?? d.departmentCode });
            }}
            options={db.roles.map((r) => ({ value: r.code, label: r.title }))}
          />
        </Field>
        <Field label="Отдел">
          <Select
            value={d.departmentCode}
            onChange={(v) => set({ departmentCode: v as DepartmentCode })}
            options={Object.entries(DEPARTMENT_TITLES).map(([k, v]) => ({ value: k, label: v }))}
          />
        </Field>
        <Field label="Руководитель">
          <Select
            value={d.managerId ?? ''}
            onChange={(v) => set({ managerId: v || null })}
            options={[{ value: '', label: '— нет —' }, ...db.users.filter((u) => u.id !== d.id).map((u) => ({ value: u.id, label: u.fullName }))]}
          />
        </Field>
      </div>

      <h4 className="mt-16 mb-8">Лимиты по скидке и наценке</h4>
      <div className="grid cols-3">
        <Field label="Максимальная скидка, %" hint="выше — только с согласованием">
          <NumInput value={d.limits?.maxDiscountPct ?? 0} onChange={(v) => set({ limits: { ...d.limits, maxDiscountPct: v } })} />
        </Field>
        <Field label="Минимальная наценка, %">
          <NumInput value={d.limits?.minMarkupPct ?? 0} onChange={(v) => set({ limits: { ...d.limits, minMarkupPct: v } })} />
        </Field>
        <Field label="Максимальная наценка, %">
          <NumInput value={d.limits?.maxMarkupPct ?? 0} onChange={(v) => set({ limits: { ...d.limits, maxMarkupPct: v } })} />
        </Field>
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
        <span>Сотрудник активен (может входить в систему)</span>
      </label>
    </Modal>
  );
}

/** Персональные доступы: включаем и выключаем права поверх роли. */
function UserPermissionsDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { db, update, toast } = useApp();
  const role = db.roles.find((r) => r.code === user.roleCode);
  const rolePerms = new Set(role?.permissions ?? []);
  const [granted, setGranted] = useState<Permission[]>(user.grantedPermissions);
  const [revoked, setRevoked] = useState<Permission[]>(user.revokedPermissions);

  const isOn = (p: Permission) => (rolePerms.has(p) ? !revoked.includes(p) : granted.includes(p));

  const toggle = (p: Permission) => {
    if (rolePerms.has(p)) {
      setRevoked((r) => (r.includes(p) ? r.filter((x) => x !== p) : [...r, p]));
    } else {
      setGranted((g) => (g.includes(p) ? g.filter((x) => x !== p) : [...g, p]));
    }
  };

  const save = () => {
    update((draft) => {
      const u = draft.users.find((x) => x.id === user.id);
      if (!u) return;
      u.grantedPermissions = granted;
      u.revokedPermissions = revoked;
    }, { action: 'user.permissions', entity: 'user', entityId: user.id, details: user.fullName });
    toast('Доступы обновлены', 'success');
    onClose();
  };

  return (
    <Modal
      title={`Доступы · ${user.fullName}`}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { setGranted([]); setRevoked([]); }}>Сбросить к роли</button>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </>}
    >
      <div className="note mb-12">
        Роль <b>{role?.title}</b> даёт базовый набор прав. Здесь его можно расширить или урезать для конкретного сотрудника —
        например, скрыть от замерщика кнопки наценки, оставив скидку.
      </div>

      {PERMISSION_GROUPS.map((g) => (
        <div key={g.title} className="mb-16">
          <h4 className="mb-8">{g.title}</h4>
          {g.items.map((item) => {
            const fromRole = rolePerms.has(item.code);
            const on = isOn(item.code);
            return (
              <label className="checkbox" key={item.code}>
                <input type="checkbox" checked={on} onChange={() => toggle(item.code)} />
                <span>
                  {item.title}
                  {fromRole
                    ? <span className="tag" style={{ marginLeft: 6 }}>из роли</span>
                    : on ? <span className="tag" style={{ marginLeft: 6, color: 'var(--green)' }}>выдано лично</span> : null}
                  {item.hint && <div className="xsmall muted">{item.hint}</div>}
                </span>
              </label>
            );
          })}
        </div>
      ))}
    </Modal>
  );
}
