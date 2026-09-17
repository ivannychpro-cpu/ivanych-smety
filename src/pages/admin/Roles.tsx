import { useApp } from '../../store/AppContext';
import { DEPARTMENT_TITLES, PERMISSION_GROUPS } from '../../domain/permissions';
import type { Permission } from '../../domain/types';
import { Card, Empty } from '../../components/ui';

/** Матрица «роль × право». Здесь настраивается, что видит каждый кабинет. */
export default function Roles() {
  const { db, update, can, toast } = useApp();
  if (!can('admin.roles')) return <Empty icon="🔒" title="Раздел недоступен" />;

  const toggle = (roleCode: string, perm: Permission) => {
    update((draft) => {
      const role = draft.roles.find((r) => r.code === roleCode);
      if (!role) return;
      role.permissions = role.permissions.includes(perm)
        ? role.permissions.filter((p) => p !== perm)
        : [...role.permissions, perm];
    }, { action: 'role.permissions', entity: 'role', entityId: roleCode, details: perm });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Роли и доступы</h1>
          <p>Отметьте, какие разделы и кнопки доступны каждой роли. Изменения применяются сразу.</p>
        </div>
      </div>

      <div className="note mb-16">
        Пример настройки под вашу задачу: снимите у роли «Замерщик» галочку <b>«Видеть наценку»</b> —
        и в калькуляторе у всех замерщиков исчезнут и столбец, и ползунок наценки, а итог по смете останется.
        Скидку при этом можно оставить включённой и ограничить лимитом в карточке сотрудника.
      </div>

      <Card bodyClass="tight">
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th style={{ minWidth: 260, position: 'sticky', left: 0, background: 'var(--panel-2)' }}>Право</th>
                {db.roles.map((r) => (
                  <th key={r.code} className="center" style={{ minWidth: 86 }}>
                    <div>{r.title}</div>
                    <div className="xsmall muted" style={{ fontWeight: 400, textTransform: 'none' }}>{DEPARTMENT_TITLES[r.department]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => (
                <>
                  <tr className="group-row" key={g.title}>
                    <td colSpan={db.roles.length + 1}>{g.title}</td>
                  </tr>
                  {g.items.map((item) => (
                    <tr key={item.code}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--panel)' }}>
                        {item.title}
                        {item.hint && <div className="xsmall muted">{item.hint}</div>}
                      </td>
                      {db.roles.map((r) => (
                        <td key={r.code} className="center">
                          <input
                            type="checkbox"
                            checked={r.permissions.includes(item.code)}
                            disabled={r.code === 'admin'}
                            onChange={() => { toggle(r.code, item.code); toast(`${r.title}: ${item.title}`, 'info'); }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
