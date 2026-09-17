import type { Permission, Role, RoleCode, User } from './types';

/** Человекочитаемые названия прав — используются в интерфейсе администратора. */
export const PERMISSION_GROUPS: { title: string; items: { code: Permission; title: string; hint?: string }[] }[] = [
  {
    title: 'Сметы',
    items: [
      { code: 'estimate.view.own', title: 'Видеть свои сметы' },
      { code: 'estimate.view.all', title: 'Видеть все сметы компании' },
      { code: 'estimate.create', title: 'Создавать сметы' },
      { code: 'estimate.edit', title: 'Редактировать сметы' },
      { code: 'estimate.delete', title: 'Удалять сметы' },
      { code: 'estimate.approve', title: 'Согласовывать сметы', hint: 'Утверждение сметы руководителем' },
      { code: 'estimate.markup.view', title: 'Видеть наценку', hint: 'Если выключено — блок наценки скрыт полностью' },
      { code: 'estimate.markup.edit', title: 'Менять наценку' },
      { code: 'estimate.discount.view', title: 'Видеть скидку', hint: 'Если выключено — блок скидки скрыт полностью' },
      { code: 'estimate.discount.edit', title: 'Менять скидку' },
      { code: 'estimate.cost.view', title: 'Видеть себестоимость', hint: 'Оплата бригаде за единицу' },
      { code: 'estimate.margin.view', title: 'Видеть маржу и рентабельность' },
    ],
  },
  {
    title: 'Прайс',
    items: [
      { code: 'catalog.view', title: 'Смотреть прайс' },
      { code: 'catalog.edit', title: 'Редактировать прайс' },
      { code: 'catalog.cost.edit', title: 'Редактировать себестоимость' },
    ],
  },
  {
    title: 'Клиенты и объекты',
    items: [
      { code: 'client.view', title: 'Видеть клиентов' },
      { code: 'client.edit', title: 'Заводить и править клиентов' },
      { code: 'object.view', title: 'Видеть объекты' },
      { code: 'object.edit', title: 'Заводить и править объекты' },
    ],
  },
  {
    title: 'Документы',
    items: [
      { code: 'contract.view', title: 'Видеть договоры' },
      { code: 'contract.edit', title: 'Готовить договоры' },
      { code: 'contract.sign', title: 'Подписывать договоры' },
      { code: 'act.view', title: 'Видеть акты' },
      { code: 'act.edit', title: 'Готовить акты' },
      { code: 'act.sign', title: 'Подписывать акты' },
      { code: 'document.send', title: 'Отправлять документы клиенту' },
    ],
  },
  {
    title: 'Замер',
    items: [
      { code: 'brief.view', title: 'Видеть брифы замеров' },
      { code: 'brief.edit', title: 'Заполнять бриф замера' },
    ],
  },
  {
    title: 'Дизайн и производство',
    items: [
      { code: 'design.view', title: 'Видеть задачи дизайна' },
      { code: 'design.edit', title: 'Вести задачи дизайна' },
      { code: 'production.view', title: 'Видеть задачи производства' },
      { code: 'production.edit', title: 'Вести задачи производства' },
    ],
  },
  {
    title: 'Управленческий блок',
    items: [
      { code: 'management.view', title: 'Управленческие отчёты' },
      { code: 'management.finance', title: 'Финансовые показатели' },
      { code: 'management.payroll', title: 'Фонд оплаты труда' },
    ],
  },
  {
    title: 'Администрирование',
    items: [
      { code: 'admin.users', title: 'Управление пользователями' },
      { code: 'admin.roles', title: 'Управление ролями и доступами' },
      { code: 'admin.settings', title: 'Настройки компании' },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.code));

export const PERMISSION_TITLES: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.title])),
);

const p = (...items: Permission[]) => items;

export const DEFAULT_ROLES: Role[] = [
  {
    code: 'admin',
    title: 'Администратор',
    department: 'management',
    system: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'director',
    title: 'Генеральный директор',
    department: 'management',
    system: true,
    permissions: ALL_PERMISSIONS.filter((x) => x !== 'admin.roles'),
  },
  {
    code: 'head',
    title: 'Руководитель отдела',
    department: 'sales',
    permissions: p(
      'estimate.view.own', 'estimate.view.all', 'estimate.create', 'estimate.edit', 'estimate.delete', 'estimate.approve',
      'estimate.markup.view', 'estimate.markup.edit', 'estimate.discount.view', 'estimate.discount.edit',
      'estimate.cost.view', 'estimate.margin.view',
      'catalog.view', 'catalog.edit',
      'client.view', 'client.edit', 'object.view', 'object.edit',
      'contract.view', 'contract.edit', 'act.view', 'act.edit', 'document.send',
      'brief.view', 'brief.edit',
      'design.view', 'production.view',
      'management.view', 'management.finance',
    ),
  },
  {
    code: 'economist',
    title: 'Экономист',
    department: 'finance',
    permissions: p(
      'estimate.view.all', 'estimate.edit', 'estimate.markup.view', 'estimate.markup.edit',
      'estimate.discount.view', 'estimate.cost.view', 'estimate.margin.view',
      'catalog.view', 'catalog.edit', 'catalog.cost.edit',
      'client.view', 'object.view',
      'contract.view', 'act.view',
      'management.view', 'management.finance', 'management.payroll',
    ),
  },
  {
    code: 'accountant',
    title: 'Бухгалтер',
    department: 'finance',
    permissions: p(
      'estimate.view.all', 'estimate.cost.view',
      'catalog.view',
      'client.view', 'client.edit', 'object.view',
      'contract.view', 'act.view', 'act.edit', 'document.send',
      'management.view', 'management.finance', 'management.payroll',
    ),
  },
  {
    code: 'manager',
    title: 'Офис-менеджер',
    department: 'sales',
    permissions: p(
      'estimate.view.all', 'estimate.create', 'estimate.edit',
      'estimate.discount.view',
      'catalog.view',
      'client.view', 'client.edit', 'object.view', 'object.edit',
      'contract.view', 'contract.edit', 'act.view', 'act.edit', 'document.send',
      'brief.view',
      'design.view', 'production.view',
    ),
  },
  {
    code: 'measurer',
    title: 'Замерщик',
    department: 'sales',
    permissions: p(
      'estimate.view.own', 'estimate.create', 'estimate.edit',
      // Наценку замерщик по умолчанию не видит, скидку — видит и меняет в пределах лимита.
      'estimate.discount.view', 'estimate.discount.edit',
      'catalog.view',
      'client.view', 'client.edit', 'object.view', 'object.edit',
      'brief.view', 'brief.edit',
    ),
  },
  {
    code: 'designer',
    title: 'Дизайнер',
    department: 'design',
    permissions: p('object.view', 'design.view', 'design.edit', 'brief.view', 'estimate.view.own', 'catalog.view'),
  },
  {
    code: 'production',
    title: 'Производство',
    department: 'production',
    permissions: p(
      'object.view', 'production.view', 'production.edit', 'design.view',
      'estimate.view.all', 'estimate.cost.view', 'catalog.view',
      'act.view', 'act.edit', 'brief.view',
    ),
  },
  {
    code: 'client',
    title: 'Клиент',
    department: 'sales',
    permissions: p('estimate.view.own', 'contract.view', 'act.view'),
  },
];

/** Итоговый набор прав пользователя: роль + выданные − отозванные. */
export function effectivePermissions(user: User | null, roles: Role[]): Set<Permission> {
  if (!user || !user.active) return new Set();
  const role = roles.find((r) => r.code === user.roleCode);
  const set = new Set<Permission>(role ? role.permissions : []);
  for (const g of user.grantedPermissions) set.add(g);
  for (const r of user.revokedPermissions) set.delete(r);
  return set;
}

export function roleTitle(code: RoleCode, roles: Role[]): string {
  return roles.find((r) => r.code === code)?.title ?? code;
}

export const DEPARTMENT_TITLES: Record<string, string> = {
  management: 'Руководство',
  sales: 'Отдел продаж и замеров',
  design: 'Отдел дизайна',
  production: 'Отдел производства',
  finance: 'Финансы',
};
