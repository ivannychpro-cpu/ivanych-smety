import type { Brief, Client, CompanySettings, Contract, DB, Estimate, SiteObject, Task, User, WorkBundle } from '../domain/types';
import { DEFAULT_ROLES } from '../domain/permissions';
import { buildCatalog } from '../domain/seed/catalog';
import { SEED_BUNDLES } from '../domain/seed/bundles';
import { BRIEF_TEMPLATE } from '../domain/seed/brief';
import { mkId } from '../lib/id';
import { round2 } from '../lib/geometry';
import { estimateTotals } from '../lib/calc';

const STORAGE_KEY = 'ivanych.db.v1';
export const DB_VERSION = 1;

const now = () => new Date().toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

export const DEFAULT_SETTINGS: CompanySettings = {
  name: 'Иваныч',
  legalName: 'ООО «Иваныч Строй»',
  inn: '7700000000',
  kpp: '770001001',
  ogrn: '1157700000000',
  address: 'г. Москва, ул. Строителей, д. 1, оф. 10',
  phone: '+7 (495) 000-00-00',
  email: 'info@ivanych.ru',
  bank: 'ПАО Сбербанк',
  bik: '044525225',
  account: '40702810000000000000',
  director: 'Иванов Иван Иванович',
  directorBasis: 'Устава',
  defaultMarkupPct: 15,
  maxDiscountWithoutApproval: 7,
};

const SEED_USERS: Omit<User, 'id' | 'createdAt'>[] = [
  { fullName: 'Иванов Иван Иванович', login: 'director', email: 'director@ivanych.ru', roleCode: 'director', departmentCode: 'management', active: true, grantedPermissions: [], revokedPermissions: [] },
  { fullName: 'Смирнова Ольга Петровна', login: 'head', email: 'head@ivanych.ru', roleCode: 'head', departmentCode: 'sales', active: true, grantedPermissions: [], revokedPermissions: [], limits: { maxDiscountPct: 15, minMarkupPct: 5 } },
  { fullName: 'Кузнецов Алексей Сергеевич', login: 'economist', email: 'economist@ivanych.ru', roleCode: 'economist', departmentCode: 'finance', active: true, grantedPermissions: [], revokedPermissions: [] },
  { fullName: 'Попова Мария Андреевна', login: 'buh', email: 'buh@ivanych.ru', roleCode: 'accountant', departmentCode: 'finance', active: true, grantedPermissions: [], revokedPermissions: [] },
  { fullName: 'Волкова Анна Дмитриевна', login: 'manager', email: 'office@ivanych.ru', roleCode: 'manager', departmentCode: 'sales', active: true, grantedPermissions: [], revokedPermissions: [] },
  { fullName: 'Петров Сергей Николаевич', login: 'zamer', email: 'zamer@ivanych.ru', roleCode: 'measurer', departmentCode: 'sales', active: true, grantedPermissions: [], revokedPermissions: [], limits: { maxDiscountPct: 5 } },
  { fullName: 'Соколова Елена Игоревна', login: 'design', email: 'design@ivanych.ru', roleCode: 'designer', departmentCode: 'design', active: true, grantedPermissions: [], revokedPermissions: [] },
  { fullName: 'Морозов Дмитрий Викторович', login: 'prorab', email: 'prorab@ivanych.ru', roleCode: 'production', departmentCode: 'production', active: true, grantedPermissions: [], revokedPermissions: [] },
  { fullName: 'Администратор', login: 'admin', email: 'admin@ivanych.ru', roleCode: 'admin', departmentCode: 'management', active: true, grantedPermissions: [], revokedPermissions: [] },
];

export function createSeedDB(): DB {
  const { sections, items } = buildCatalog(() => mkId('cat-'));
  const bundles: WorkBundle[] = SEED_BUNDLES.map((b) => ({ ...b, id: mkId('bnd-') }));

  const users: User[] = SEED_USERS.map((u) => ({ ...u, id: mkId('usr-'), createdAt: daysAgo(120) }));
  const byLogin = (login: string) => users.find((u) => u.login === login)!;
  const head = byLogin('head');
  for (const u of users) {
    if (['measurer', 'manager'].includes(u.roleCode)) u.managerId = head.id;
  }

  const clients: Client[] = [
    {
      id: mkId('cli-'), type: 'person', fullName: 'Сергеев Павел Олегович', phone: '+7 (916) 111-22-33',
      email: 'sergeev@example.com', passport: '45 00 123456, выдан ОВД г. Москвы 12.05.2010',
      address: 'г. Москва, ул. Ленина, д. 5, кв. 42', source: 'Сайт', managerId: byLogin('manager').id, createdAt: daysAgo(40),
    },
    {
      id: mkId('cli-'), type: 'person', fullName: 'Николаева Ирина Владимировна', phone: '+7 (925) 444-55-66',
      email: 'nikolaeva@example.com', address: 'МО, г. Химки, ул. Победы, д. 12, кв. 7',
      source: 'Рекомендация', managerId: byLogin('manager').id, createdAt: daysAgo(18),
    },
    {
      id: mkId('cli-'), type: 'company', fullName: 'ООО «Ромашка»', phone: '+7 (495) 777-88-99',
      email: 'office@romashka.ru', inn: '7712345678', kpp: '771201001', address: 'г. Москва, Кутузовский пр-т, д. 30',
      signatory: 'Генеральный директор Романов Р. Р.', source: 'Тендер', createdAt: daysAgo(8),
    },
  ];

  const objects: SiteObject[] = [
    {
      id: mkId('obj-'), clientId: clients[0].id, title: 'Квартира, ЖК «Ривер Парк»',
      address: 'г. Москва, ул. Ленина, д. 5, кв. 42', area: 62, ceilingHeight: 2.75,
      measurerId: byLogin('zamer').id, designerId: byLogin('design').id, foremanId: byLogin('prorab').id,
      status: 'contract', createdAt: daysAgo(40),
      rooms: [
        { id: mkId('rm-'), name: 'Гостиная-кухня', type: 'комната', length: 5.4, width: 4.2, height: 2.75, doors: 1, windows: 2 },
        { id: mkId('rm-'), name: 'Спальня', type: 'комната', length: 4.0, width: 3.2, height: 2.75, doors: 1, windows: 1 },
        { id: mkId('rm-'), name: 'Санузел', type: 'санузел', length: 2.4, width: 1.8, height: 2.75, doors: 1, windows: 0 },
        { id: mkId('rm-'), name: 'Коридор', type: 'коридор', length: 4.5, width: 1.4, height: 2.75, doors: 3, windows: 0 },
      ],
    },
    {
      id: mkId('obj-'), clientId: clients[1].id, title: 'Квартира в Химках',
      address: 'МО, г. Химки, ул. Победы, д. 12, кв. 7', area: 44, ceilingHeight: 2.6,
      measurerId: byLogin('zamer').id, status: 'measured', createdAt: daysAgo(18),
      rooms: [
        { id: mkId('rm-'), name: 'Комната', type: 'комната', length: 4.6, width: 3.4, height: 2.6, doors: 1, windows: 1 },
        { id: mkId('rm-'), name: 'Кухня', type: 'кухня', length: 3.2, width: 2.6, height: 2.6, doors: 1, windows: 1 },
        { id: mkId('rm-'), name: 'Санузел', type: 'санузел', length: 2.2, width: 1.7, height: 2.6, doors: 1, windows: 0 },
      ],
    },
    {
      id: mkId('obj-'), clientId: clients[2].id, title: 'Офис 180 м², Кутузовский',
      address: 'г. Москва, Кутузовский пр-т, д. 30, 4 этаж', area: 180, ceilingHeight: 3.1,
      measurerId: byLogin('zamer').id, status: 'lead', createdAt: daysAgo(8),
      rooms: [
        { id: mkId('rm-'), name: 'Open space', type: 'офис', length: 12, width: 8, height: 3.1, doors: 2, windows: 6 },
        { id: mkId('rm-'), name: 'Переговорная', type: 'офис', length: 5, width: 4, height: 3.1, doors: 1, windows: 2 },
      ],
    },
  ];

  const estimates: Estimate[] = [];
  const byCode = (code: string) => items.find((i) => i.code === code)!;

  // Демо-смета по первому объекту.
  {
    const obj = objects[0];
    const living = obj.rooms[0];
    const bed = obj.rooms[1];
    const bath = obj.rooms[2];
    const lines: Estimate['lines'] = [];
    let order = 0;
    const add = (code: string, roomId: string, qty: number) => {
      const it = byCode(code);
      lines.push({
        id: mkId('ln-'), roomId, catalogItemId: it.id, code: it.code, title: it.title, unit: it.unit,
        kind: it.kind, qty: round2(qty), qtyAuto: true, qtyBasis: it.qtyBasis,
        basePrice: it.price, cost: it.cost, order: order++,
      });
    };
    for (const [room, walls, floor] of [[living, 47.4, 22.7], [bed, 36.6, 12.8]] as const) {
      add('07.01', room.id, walls);
      add('07.02', room.id, walls);
      add('07.03', room.id, walls);
      add('07.04', room.id, walls);
      add('07.05', room.id, walls);
      add('07.08', room.id, walls);
      add('03.01', room.id, floor);
      add('03.02', room.id, floor);
      add('03.03', room.id, floor);
      add('08.01', room.id, floor);
      add('04.01', room.id, floor);
      add('09.01', room.id, floor);
      add('09.02', room.id, floor);
      add('09.03', room.id, floor);
    }
    add('10.01', bath.id, 23.1);
    add('10.03', bath.id, 4.3);
    add('10.05', bath.id, 27.4);
    add('03.06', bath.id, 4.3);
    add('06.01', bath.id, 3);
    add('06.02', bath.id, 2);

    estimates.push({
      id: mkId('est-'), number: 'СМ-2026-0001', title: 'Ремонт под ключ, ЖК «Ривер Парк»',
      objectId: obj.id, clientId: obj.clientId, authorId: byLogin('zamer').id,
      status: 'approved', markupPct: 15, discountPct: 3, roundTo: 100, version: 1, lines,
      approval: { requestedAt: daysAgo(35), approvedBy: head.id, approvedAt: daysAgo(34) },
      createdAt: daysAgo(36), updatedAt: daysAgo(34),
    });
  }

  // Черновик по второму объекту.
  {
    const obj = objects[1];
    const room = obj.rooms[0];
    const lines: Estimate['lines'] = [];
    let order = 0;
    for (const code of ['07.01', '07.04', '07.05', '07.07'] as const) {
      const it = byCode(code);
      lines.push({
        id: mkId('ln-'), roomId: room.id, catalogItemId: it.id, code: it.code, title: it.title, unit: it.unit,
        kind: it.kind, qty: 37.4, qtyAuto: true, qtyBasis: it.qtyBasis, basePrice: it.price, cost: it.cost, order: order++,
      });
    }
    estimates.push({
      id: mkId('est-'), number: 'СМ-2026-0002', title: 'Косметический ремонт, Химки',
      objectId: obj.id, clientId: obj.clientId, authorId: byLogin('zamer').id,
      status: 'draft', markupPct: 15, discountPct: 0, roundTo: 100, version: 1, lines,
      createdAt: daysAgo(6), updatedAt: daysAgo(2),
    });
  }

  const contractAmount = estimateTotals(estimates[0]).total;
  const contracts: Contract[] = [
    {
      id: mkId('ctr-'), number: 'Д-2026-0001', date: daysAgo(33), clientId: clients[0].id, objectId: objects[0].id,
      estimateId: estimates[0].id, amount: contractAmount, status: 'inWork', managerId: byLogin('manager').id,
      startDate: daysAgo(30), endDate: daysAhead(45),
      terms: { prepaymentPct: 30, warrantyMonths: 24, penaltyPctPerDay: 0.1 },
      payments: [
        { id: mkId('pay-'), title: 'Аванс 30%', amount: round2(contractAmount * 0.3), dueDate: daysAgo(32), paidAt: daysAgo(32) },
        { id: mkId('pay-'), title: 'Черновой этап 40%', amount: round2(contractAmount * 0.4), dueDate: daysAgo(5), paidAt: daysAgo(4) },
        { id: mkId('pay-'), title: 'Чистовой этап 30%', amount: round2(contractAmount * 0.3), dueDate: daysAhead(30), paidAt: null },
      ],
      createdAt: daysAgo(33), updatedAt: daysAgo(4),
    },
  ];

  const briefs: Brief[] = [
    {
      id: mkId('brf-'), objectId: objects[1].id, measurerId: byLogin('zamer').id, templateId: BRIEF_TEMPLATE.id,
      answers: [
        { questionId: 'buildingType', value: 'Панель' },
        { questionId: 'state', value: 'С отделкой (под демонтаж)' },
        { questionId: 'scope', value: 'Косметический ремонт' },
        { questionId: 'materialsBy', value: 'Заказчик' },
        { questionId: 'water', value: true },
        { questionId: 'wallsFinish', value: ['Обои'] },
        { questionId: 'floorDrop', value: 25, comment: 'Перепад в сторону кухни' },
      ],
      attachments: [], status: 'draft', createdAt: daysAgo(17), updatedAt: daysAgo(17),
    },
  ];

  const tasks: Task[] = [
    { id: mkId('tsk-'), objectId: objects[0].id, title: 'Планировочное решение', department: 'design', assigneeId: byLogin('design').id, status: 'done', plannedStart: daysAgo(30), plannedEnd: daysAgo(24), factEnd: daysAgo(25), createdAt: daysAgo(30) },
    { id: mkId('tsk-'), objectId: objects[0].id, title: 'Развёртки санузла и схемы раскладки плитки', department: 'design', assigneeId: byLogin('design').id, status: 'inWork', plannedStart: daysAgo(20), plannedEnd: daysAhead(3), factEnd: null, createdAt: daysAgo(20) },
    { id: mkId('tsk-'), objectId: objects[0].id, title: 'Демонтажные работы', department: 'production', assigneeId: byLogin('prorab').id, status: 'done', plannedStart: daysAgo(29), plannedEnd: daysAgo(22), factEnd: daysAgo(21), createdAt: daysAgo(29) },
    { id: mkId('tsk-'), objectId: objects[0].id, title: 'Черновые работы: стяжка и штукатурка', department: 'production', assigneeId: byLogin('prorab').id, status: 'inWork', plannedStart: daysAgo(20), plannedEnd: daysAhead(10), factEnd: null, createdAt: daysAgo(20) },
    { id: mkId('tsk-'), objectId: objects[0].id, title: 'Укладка плитки в санузле', department: 'production', assigneeId: byLogin('prorab').id, status: 'blocked', plannedStart: daysAhead(5), plannedEnd: daysAhead(15), factEnd: null, note: 'Ждём раскладку от дизайна', createdAt: daysAgo(18) },
  ];

  return {
    version: DB_VERSION,
    users,
    roles: DEFAULT_ROLES,
    sections,
    catalog: items,
    bundles,
    clients,
    objects,
    estimates,
    contracts,
    acts: [],
    briefs,
    tasks,
    audit: [{ id: mkId('aud-'), at: now(), userId: users[0].id, action: 'seed', entity: 'system', entityId: 'init', details: 'Создана демонстрационная база' }],
    settings: DEFAULT_SETTINGS,
    currentUserId: null,
  };
}

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedDB();
    const parsed = JSON.parse(raw) as DB;
    if (!parsed || parsed.version !== DB_VERSION) return createSeedDB();
    return parsed;
  } catch {
    return createSeedDB();
  }
}

export function saveDB(db: DB): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Не удалось сохранить данные локально', e);
  }
}

export function resetDB(): DB {
  const fresh = createSeedDB();
  saveDB(fresh);
  return fresh;
}

export function exportDB(db: DB): string {
  return JSON.stringify(db, null, 2);
}
