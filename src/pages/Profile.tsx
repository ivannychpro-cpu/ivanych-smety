import { useApp } from '../store/AppContext';
import { DEPARTMENT_TITLES, PERMISSION_GROUPS, roleTitle } from '../domain/permissions';
import { Avatar, Card } from '../components/ui';
import { userMetrics } from '../lib/analytics';
import { money, pct } from '../lib/money';

/** Профиль: кто я, что мне доступно и мои показатели. */
export default function Profile() {
  const { db, currentUser, permissions, logout } = useApp();
  if (!currentUser) return null;
  const m = userMetrics(db, currentUser.id);

  return (
    <>
      <div className="page-head">
        <div className="flex items-center gap-8" style={{ gap: 14 }}>
          <Avatar name={currentUser.fullName} lg />
          <div>
            <h1>{currentUser.fullName}</h1>
            <p>{roleTitle(currentUser.roleCode, db.roles)} · {DEPARTMENT_TITLES[currentUser.departmentCode]} · {currentUser.email}</p>
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={logout}>Сменить пользователя</button>
      </div>

      <div className="grid cols-2">
        <Card title="Мои показатели" bodyClass="tight">
          <div className="table-wrap">
            <table className="tbl compact">
              <tbody>
                <tr><td>Смет создано</td><td className="num strong">{m.estimates}</td></tr>
                <tr><td>Сумма смет</td><td className="num strong">{money(m.sum)}</td></tr>
                <tr><td>Утверждено</td><td className="num">{m.approved} · {money(m.approvedSum)}</td></tr>
                <tr><td>Средний чек</td><td className="num">{money(m.avgCheck)}</td></tr>
                <tr><td>Объектов</td><td className="num">{m.objects}</td></tr>
                <tr><td>Конверсия</td><td className="num">{m.objects ? pct(m.conversion) : '—'}</td></tr>
              </tbody>
            </table>
          </div>
          {currentUser.limits && (
            <div className="note mt-12 xsmall">
              Ваши лимиты:
              {currentUser.limits.maxDiscountPct != null && ` скидка не более ${currentUser.limits.maxDiscountPct}%.`}
              {currentUser.limits.minMarkupPct != null && ` наценка не менее ${currentUser.limits.minMarkupPct}%.`}
              {' '}Превышение потребует согласования руководителя.
            </div>
          )}
        </Card>

        <Card title="Мои доступы" bodyClass="tight">
          <div className="small muted mb-8">Что мне разрешено в системе. Настраивается администратором.</div>
          {PERMISSION_GROUPS.map((g) => {
            const items = g.items.filter((i) => permissions.has(i.code));
            if (items.length === 0) return null;
            return (
              <div key={g.title} className="mb-12">
                <div className="strong small">{g.title}</div>
                <div>{items.map((i) => <span key={i.code} className="tag">{i.title}</span>)}</div>
              </div>
            );
          })}
        </Card>
      </div>
    </>
  );
}
