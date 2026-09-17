/** Доменная модель приложения «Иваныч». */

export type ID = string;

/* ─────────────── Пользователи, роли, доступы ─────────────── */

export type RoleCode =
  | 'admin'        // администратор системы
  | 'director'     // генеральный директор
  | 'head'         // руководитель отдела
  | 'economist'    // экономист
  | 'accountant'   // бухгалтер
  | 'manager'      // офис-менеджер
  | 'measurer'     // замерщик
  | 'designer'     // дизайнер
  | 'production'   // отдел производства (ПТО / прораб)
  | 'client';      // личный кабинет клиента (только чтение своих документов)

export type DepartmentCode = 'management' | 'sales' | 'design' | 'production' | 'finance';

export interface Role {
  code: RoleCode;
  title: string;
  department: DepartmentCode;
  /** Базовый набор прав роли. Пользователю можно выдать/отобрать права поверх роли. */
  permissions: Permission[];
  /** Системные роли нельзя удалить из интерфейса. */
  system?: boolean;
}

export interface User {
  id: ID;
  fullName: string;
  login: string;
  email: string;
  phone?: string;
  roleCode: RoleCode;
  departmentCode: DepartmentCode;
  /** Руководитель (для орг-структуры и согласований). */
  managerId?: ID | null;
  active: boolean;
  /** Индивидуальные права: выданные сверх роли. */
  grantedPermissions: Permission[];
  /** Индивидуальные права: отобранные у роли. */
  revokedPermissions: Permission[];
  /** Персональные лимиты замерщика/менеджера по скидке и наценке. */
  limits?: {
    maxDiscountPct?: number;
    minMarkupPct?: number;
    maxMarkupPct?: number;
  };
  createdAt: string;
}

export type Permission =
  /* Сметы */
  | 'estimate.view.own'
  | 'estimate.view.all'
  | 'estimate.create'
  | 'estimate.edit'
  | 'estimate.delete'
  | 'estimate.approve'
  | 'estimate.markup.view'
  | 'estimate.markup.edit'
  | 'estimate.discount.view'
  | 'estimate.discount.edit'
  | 'estimate.cost.view'      // себестоимость / оплата бригаде
  | 'estimate.margin.view'    // маржа и рентабельность
  /* Прайс */
  | 'catalog.view'
  | 'catalog.edit'
  | 'catalog.cost.edit'
  /* Клиенты и объекты */
  | 'client.view'
  | 'client.edit'
  | 'object.view'
  | 'object.edit'
  /* Документы */
  | 'contract.view'
  | 'contract.edit'
  | 'contract.sign'
  | 'act.view'
  | 'act.edit'
  | 'act.sign'
  | 'document.send'
  /* Замер */
  | 'brief.view'
  | 'brief.edit'
  /* Производство и дизайн */
  | 'production.view'
  | 'production.edit'
  | 'design.view'
  | 'design.edit'
  /* Управленческий блок */
  | 'management.view'
  | 'management.finance'
  | 'management.payroll'
  /* Администрирование */
  | 'admin.users'
  | 'admin.roles'
  | 'admin.settings';

/* ─────────────── Прайс (справочник работ и материалов) ─────────────── */

export type Unit = 'м2' | 'м.п.' | 'шт' | 'точка' | 'компл' | 'м3' | 'час' | 'смена' | 'усл';

/** Как считать объём работы по геометрии помещения. */
export type QtyBasis =
  | 'manual'      // вручную
  | 'floor'       // площадь пола
  | 'ceiling'     // площадь потолка
  | 'walls'       // площадь стен за вычетом проёмов
  | 'wallsGross'  // площадь стен без вычета проёмов
  | 'perimeter'   // периметр помещения
  | 'slopes'      // погонаж откосов проёмов
  | 'openings'    // количество проёмов
  | 'volume'      // объём помещения
  | 'rooms';      // на помещение (1 шт)

export type PriceKind = 'work' | 'material' | 'service';

export interface CatalogSection {
  id: ID;
  code: string;          // «01», «02» …
  title: string;         // «Демонтажные работы»
  stage?: StageCode;     // к какому этапу относится
  order: number;
}

export type StageCode =
  | 'demolition' | 'rough' | 'engineering' | 'finishing' | 'final' | 'other';

export interface CatalogItem {
  id: ID;
  sectionId: ID;
  code: string;          // артикул: «02.14»
  title: string;
  unit: Unit;
  kind: PriceKind;
  /** Цена для клиента за единицу (базовый прайс, до наценки/скидки). */
  price: number;
  /** Себестоимость: оплата мастеру за единицу. Видна не всем. */
  cost: number;
  qtyBasis: QtyBasis;
  /** Коэффициент к базе расчёта (например, 2 слоя шпаклёвки → 1, но покраска в 2 слоя → 2). */
  qtyFactor?: number;
  /** Норма расхода материала на единицу работы (для авто-подбора материалов). */
  norm?: { materialCode: string; perUnit: number }[];
  /** Технологические связи: коды работ, которые почти всегда идут вместе. */
  companions?: string[];
  /** Работы, без которых эта не выполняется (жёсткая связка → предупреждение). */
  requires?: string[];
  note?: string;
  tags?: string[];
  active: boolean;
}

/** Технологический набор («подсказка»): цепочка работ, которые делаются вместе. */
export interface WorkBundle {
  id: ID;
  title: string;          // «Стены под покраску (штукатурка + шпаклёвка)»
  description?: string;
  stage: StageCode;
  surface: QtyBasis;      // основная база расчёта набора
  items: { code: string; factor?: number; optional?: boolean }[];
  tags?: string[];
}

/* ─────────────── Клиенты, объекты ─────────────── */

export interface Client {
  id: ID;
  type: 'person' | 'company';
  fullName: string;
  phone: string;
  email: string;
  /** Паспортные/реквизитные данные — подтягиваются во все документы. */
  passport?: string;
  address?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  bank?: string;
  bik?: string;
  account?: string;
  signatory?: string;     // подписант со стороны заказчика
  source?: string;        // источник обращения
  managerId?: ID;
  note?: string;
  createdAt: string;
}

export interface SiteObject {
  id: ID;
  clientId: ID;
  title: string;          // «ЖК Ривер Парк, кв. 142»
  address: string;
  area?: number;          // общая площадь
  ceilingHeight?: number;
  rooms: Room[];
  /** Ответственные */
  measurerId?: ID;
  designerId?: ID;
  foremanId?: ID;
  status: 'lead' | 'measured' | 'estimated' | 'contract' | 'inWork' | 'done' | 'lost';
  createdAt: string;
}

/** Помещение с габаритами — из них считаются объёмы работ. */
export interface Room {
  id: ID;
  name: string;           // «Кухня»
  type?: string;          // «санузел», «комната», «коридор»
  length: number;         // м
  width: number;          // м
  height: number;         // м
  /** Проёмы: двери и окна. */
  doors: number;
  windows: number;
  /** Дополнительный вычет из площади стен, м2 (ниши, шкафы). */
  extraDeduction?: number;
  /** Ручные переопределения площадей, если геометрия сложная. */
  overrides?: Partial<Record<'floor' | 'ceiling' | 'walls' | 'perimeter' | 'slopes', number>>;
  note?: string;
}

/* ─────────────── Смета ─────────────── */

export type EstimateStatus = 'draft' | 'onApproval' | 'approved' | 'rejected' | 'sent' | 'signed' | 'archived';

export interface EstimateLine {
  id: ID;
  roomId?: ID | null;          // привязка к помещению (или null — общие работы)
  catalogItemId?: ID | null;   // null → произвольная строка
  code: string;
  title: string;
  unit: Unit;
  kind: PriceKind;
  qty: number;
  /** Как посчитан объём: авто по геометрии или вручную. */
  qtyAuto: boolean;
  qtyBasis: QtyBasis;
  basePrice: number;           // цена прайса за ед.
  cost: number;                // себестоимость за ед.
  /** Индивидуальная наценка/скидка по строке, % (перекрывает общую). */
  markupPct?: number | null;
  discountPct?: number | null;
  bundleId?: ID | null;        // из какого набора добавлена
  note?: string;
  order: number;
}

export interface Estimate {
  id: ID;
  number: string;              // «СМ-2026-0031»
  title: string;
  objectId: ID;
  clientId: ID;
  authorId: ID;
  status: EstimateStatus;
  /** Общая наценка и скидка на смету, %. */
  markupPct: number;
  discountPct: number;
  /** Округление итога до, руб. (0 — не округлять). */
  roundTo: number;
  lines: EstimateLine[];
  /** Версии: при правке после согласования создаётся новая версия. */
  version: number;
  parentId?: ID | null;
  comment?: string;
  approval?: {
    requestedAt?: string;
    approvedBy?: ID;
    approvedAt?: string;
    rejectReason?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/* ─────────────── Договоры и акты ─────────────── */

export type ContractStatus = 'draft' | 'onApproval' | 'signed' | 'inWork' | 'closed' | 'cancelled';

export interface Contract {
  id: ID;
  number: string;              // «Д-2026-0014»
  date: string;
  clientId: ID;
  objectId: ID;
  estimateId?: ID | null;      // смета-основание
  amount: number;
  /** График платежей. */
  payments: { id: ID; title: string; amount: number; dueDate?: string; paidAt?: string | null }[];
  startDate?: string;
  endDate?: string;
  status: ContractStatus;
  managerId?: ID;
  terms?: {
    prepaymentPct?: number;
    warrantyMonths?: number;
    penaltyPctPerDay?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type ActKind = 'work' | 'extra' | 'hidden' | 'transfer';

export interface Act {
  id: ID;
  number: string;
  kind: ActKind;               // выполненных работ / дополнительных / скрытых / приёма-передачи
  date: string;
  contractId: ID;
  estimateId?: ID | null;      // для доп. работ — своя смета
  lines: { id: ID; code: string; title: string; unit: Unit; qty: number; price: number }[];
  amount: number;
  status: 'draft' | 'sent' | 'signed';
  createdAt: string;
}

/* ─────────────── Замер: бриф и вложения ─────────────── */

export interface BriefAnswer {
  questionId: string;
  value: string | number | boolean | string[] | null;
  comment?: string;
}

export interface Brief {
  id: ID;
  objectId: ID;
  measurerId: ID;
  templateId: string;
  answers: BriefAnswer[];
  /** Вложения: фото, аудио-комментарии, чертежи. Файлы лежат в IndexedDB. */
  attachments: Attachment[];
  status: 'draft' | 'done';
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: ID;
  name: string;
  mime: string;
  size: number;
  kind: 'photo' | 'audio' | 'drawing' | 'file';
  /** Расшифровка голосового комментария (заполняется вручную или сервисом ASR). */
  transcript?: string;
  roomId?: ID | null;
  createdAt: string;
}

export interface BriefQuestion {
  id: string;
  title: string;
  hint?: string;
  type: 'text' | 'number' | 'bool' | 'select' | 'multi' | 'photo';
  options?: string[];
  required?: boolean;
  /** Влияние ответа на смету: подсказать набор работ. */
  suggestBundles?: string[];
}

export interface BriefTemplate {
  id: string;
  title: string;
  groups: { id: string; title: string; questions: BriefQuestion[] }[];
}

/* ─────────────── Производство и дизайн ─────────────── */

export interface Task {
  id: ID;
  objectId: ID;
  title: string;
  department: 'design' | 'production';
  stage?: StageCode;
  assigneeId?: ID;
  status: 'new' | 'inWork' | 'review' | 'done' | 'blocked';
  plannedStart?: string;
  plannedEnd?: string;
  factEnd?: string | null;
  /** Задача производства может ждать результата дизайна. */
  dependsOnTaskId?: ID | null;
  note?: string;
  createdAt: string;
}

/* ─────────────── Журнал действий ─────────────── */

export interface AuditEvent {
  id: ID;
  at: string;
  userId: ID;
  action: string;
  entity: string;
  entityId: ID;
  details?: string;
}

/* ─────────────── Настройки компании ─────────────── */

export interface CompanySettings {
  name: string;
  legalName: string;
  inn: string;
  kpp?: string;
  ogrn?: string;
  address: string;
  phone: string;
  email: string;
  bank?: string;
  bik?: string;
  account?: string;
  director: string;
  directorBasis: string;       // «на основании Устава»
  /** Наценка по умолчанию для новых смет, %. */
  defaultMarkupPct: number;
  /** Максимальная скидка без согласования, %. */
  maxDiscountWithoutApproval: number;
  logoDataUrl?: string;
}

export interface DB {
  version: number;
  users: User[];
  roles: Role[];
  sections: CatalogSection[];
  catalog: CatalogItem[];
  bundles: WorkBundle[];
  clients: Client[];
  objects: SiteObject[];
  estimates: Estimate[];
  contracts: Contract[];
  acts: Act[];
  briefs: Brief[];
  tasks: Task[];
  audit: AuditEvent[];
  settings: CompanySettings;
  currentUserId: ID | null;
}
