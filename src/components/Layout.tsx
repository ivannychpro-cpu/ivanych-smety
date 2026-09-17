import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { roleTitle } from '../domain/permissions';
import { Avatar } from './ui';
import type { Permission } from '../domain/types';

interface NavEntry {
  to: string;
  label: string;
  icon: string;
  perms?: Permission[];   // достаточно одного из
  count?: number;
}

export default function Layout() {
  const { db, currentUser, canAny, logout } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  const groups = useMemo(() => {
    const myEstimates = db.estimates.filter(
      (e) => canAny('estimate.view.all') || e.authorId === currentUser?.id,
    ).length;
    const onApproval = db.estimates.filter((e) => e.status === 'onApproval').length;

    const list: { title: string; items: NavEntry[] }[] = [
      {
        title: 'Работа',
        items: [
          { to: '/', label: 'Мой кабинет', icon: '🏠' },
          { to: '/estimates', label: 'Сметы', icon: '🧮', perms: ['estimate.view.own', 'estimate.view.all'], count: myEstimates },
          { to: '/briefs', label: 'Замеры', icon: '📐', perms: ['brief.view'] },
          { to: '/clients', label: 'Клиенты', icon: '👤', perms: ['client.view'] },
          { to: '/objects', label: 'Объекты', icon: '🏗️', perms: ['object.view'] },
        ],
      },
      {
        title: 'Документы',
        items: [
          { to: '/contracts', label: 'Договоры', icon: '📑', perms: ['contract.view'] },
          { to: '/acts', label: 'Акты', icon: '✅', perms: ['act.view'] },
        ],
      },
      {
        title: 'Отделы',
        items: [
          { to: '/design', label: 'Дизайн', icon: '🎨', perms: ['design.view'] },
          { to: '/production', label: 'Производство', icon: '🔨', perms: ['production.view'] },
        ],
      },
      {
        title: 'Аналитика',
        items: [
          { to: '/management', label: 'Управленческий блок', icon: '📊', perms: ['management.view'] },
          { to: '/approvals', label: 'Согласования', icon: '🖊️', perms: ['estimate.approve'], count: onApproval },
        ],
      },
      {
        title: 'Справочники',
        items: [
          { to: '/catalog', label: 'Прайс', icon: '📋', perms: ['catalog.view'] },
          { to: '/bundles', label: 'Наборы работ', icon: '🧩', perms: ['catalog.view'] },
        ],
      },
      {
        title: 'Администрирование',
        items: [
          { to: '/admin/users', label: 'Сотрудники', icon: '👥', perms: ['admin.users'] },
          { to: '/admin/roles', label: 'Роли и доступы', icon: '🔐', perms: ['admin.roles'] },
          { to: '/admin/settings', label: 'Настройки', icon: '⚙️', perms: ['admin.settings'] },
        ],
      },
    ];

    return list
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.perms || canAny(...i.perms)) }))
      .filter((g) => g.items.length > 0);
  }, [db.estimates, currentUser, canAny]);

  if (!currentUser) return null;

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">И</div>
          <div>
            <b>{db.settings.name}</b>
            <span>сметы и управление</span>
          </div>
        </div>

        {groups.map((g) => (
          <div className="sidebar-group" key={g.title}>
            <div className="sidebar-group-title">{g.title}</div>
            {g.items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="ico">{i.icon}</span>
                <span>{i.label}</span>
                {i.count ? <span className="badge-count">{i.count}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <div style={{ color: '#8fa1b8' }}>{currentUser.fullName}</div>
          <div style={{ color: '#5d6f88', fontSize: 11 }}>{roleTitle(currentUser.roleCode, db.roles)}</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn ghost sm no-print" style={{ display: 'none' }} id="burger" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <div>
            <div className="topbar-title">{pageTitle(location.pathname)}</div>
            <div className="topbar-sub">{roleTitle(currentUser.roleCode, db.roles)} · {currentUser.fullName}</div>
          </div>
          <div className="spacer" />
          <div className="user-chip no-print" onClick={() => nav('/profile')}>
            <Avatar name={currentUser.fullName} />
            <div className="small">
              <div className="strong">{shortName(currentUser.fullName)}</div>
              <div className="muted xsmall">{currentUser.email}</div>
            </div>
          </div>
          <button className="btn sm no-print" onClick={logout} title="Сменить пользователя">Выйти</button>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function shortName(full: string): string {
  const [last, first, middle] = full.split(' ');
  if (!first) return full;
  return `${last} ${first[0]}.${middle ? ` ${middle[0]}.` : ''}`;
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Мой кабинет'],
  [/^\/estimates\/new/, 'Новая смета'],
  [/^\/estimates\/[^/]+$/, 'Калькулятор сметы'],
  [/^\/estimates/, 'Сметы'],
  [/^\/briefs/, 'Замеры и брифы'],
  [/^\/clients/, 'Клиенты'],
  [/^\/objects/, 'Объекты'],
  [/^\/contracts/, 'Договоры'],
  [/^\/acts/, 'Акты'],
  [/^\/design/, 'Отдел дизайна'],
  [/^\/production/, 'Отдел производства'],
  [/^\/management/, 'Управленческий блок'],
  [/^\/approvals/, 'Согласования'],
  [/^\/catalog/, 'Прайс'],
  [/^\/bundles/, 'Наборы работ'],
  [/^\/admin\/users/, 'Сотрудники'],
  [/^\/admin\/roles/, 'Роли и доступы'],
  [/^\/admin\/settings/, 'Настройки компании'],
  [/^\/profile/, 'Профиль'],
  [/^\/documents/, 'Документы'],
];

function pageTitle(path: string): string {
  for (const [re, title] of TITLES) if (re.test(path)) return title;
  return 'Иваныч';
}
