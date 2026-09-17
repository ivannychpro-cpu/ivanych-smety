import { useApp } from '../store/AppContext';
import { roleTitle, DEPARTMENT_TITLES } from '../domain/permissions';
import { Avatar } from '../components/ui';

/**
 * Демонстрационный вход: выбор сотрудника.
 * При переходе на серверную часть здесь появится логин/пароль или SSO.
 */
export default function Login() {
  const { db, login } = useApp();
  const users = db.users.filter((u) => u.active);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <div className="flex items-center gap-8" style={{ gap: 12 }}>
            <div className="sidebar-logo" style={{ width: 40, height: 40, fontSize: 18 }}>И</div>
            <div>
              <h1 style={{ marginBottom: 2 }}>{db.settings.name}</h1>
              <div className="muted small">Сметы, договоры и кабинеты сотрудников</div>
            </div>
          </div>
          <div className="note mt-16">
            Выберите сотрудника — откроется его кабинет с правами его роли.
            Набор кнопок, разделов и цифр у каждой роли свой.
          </div>
        </div>
        <div className="login-users">
          {users.map((u) => (
            <button key={u.id} className="login-user" onClick={() => login(u.id)}>
              <Avatar name={u.fullName} />
              <div style={{ minWidth: 0 }}>
                <b>{u.fullName}</b>
                <span>{roleTitle(u.roleCode, db.roles)} · {DEPARTMENT_TITLES[u.departmentCode]}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
