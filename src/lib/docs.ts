import type { Act, Client, CompanySettings, Contract, Estimate, SiteObject } from '../domain/types';
import { estimateTotals } from './calc';
import { money2, moneyInWords } from './money';

export function formatRuDate(iso?: string | null): string {
  if (!iso) return '«___» __________ ____ г.';
  const d = new Date(iso);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `«${String(d.getDate()).padStart(2, '0')}» ${months[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** Реквизиты заказчика одной строкой — для подвала документов. */
export function clientRequisites(c: Client | undefined): string[] {
  if (!c) return [];
  if (c.type === 'company') {
    return [
      c.fullName,
      c.address ? `Адрес: ${c.address}` : '',
      `ИНН ${c.inn ?? '—'}${c.kpp ? ` / КПП ${c.kpp}` : ''}${c.ogrn ? ` / ОГРН ${c.ogrn}` : ''}`,
      c.bank ? `${c.bank}, р/с ${c.account ?? '—'}, БИК ${c.bik ?? '—'}` : '',
      `Тел.: ${c.phone}   E-mail: ${c.email}`,
      c.signatory ? `Подписант: ${c.signatory}` : '',
    ].filter(Boolean);
  }
  return [
    c.fullName,
    c.passport ? `Паспорт: ${c.passport}` : '',
    c.address ? `Адрес: ${c.address}` : '',
    `Тел.: ${c.phone}   E-mail: ${c.email}`,
  ].filter(Boolean);
}

export function companyRequisites(s: CompanySettings): string[] {
  return [
    s.legalName,
    `Адрес: ${s.address}`,
    `ИНН ${s.inn}${s.kpp ? ` / КПП ${s.kpp}` : ''}${s.ogrn ? ` / ОГРН ${s.ogrn}` : ''}`,
    s.bank ? `${s.bank}, р/с ${s.account ?? '—'}, БИК ${s.bik ?? '—'}` : '',
    `Тел.: ${s.phone}   E-mail: ${s.email}`,
    `Директор: ${s.director}`,
  ].filter(Boolean);
}

export function amountLine(total: number): string {
  return `${money2(total)} руб. (${moneyInWords(total)})`;
}

/** Тема и текст письма клиенту — открывается в почтовой программе. */
export function mailLink(params: {
  to: string; subject: string; body: string;
}): string {
  return `mailto:${encodeURIComponent(params.to)}?subject=${encodeURIComponent(params.subject)}&body=${encodeURIComponent(params.body)}`;
}

export function estimateMail(estimate: Estimate, client: Client | undefined, object: SiteObject | undefined, settings: CompanySettings): { to: string; subject: string; body: string } {
  const t = estimateTotals(estimate);
  return {
    to: client?.email ?? '',
    subject: `Смета ${estimate.number} — ${object?.title ?? 'объект'}`,
    body: [
      `Здравствуйте, ${client?.fullName ?? ''}!`,
      '',
      `Направляем смету ${estimate.number} по объекту: ${object?.address ?? object?.title ?? '—'}.`,
      `Итоговая сумма: ${amountLine(t.total)}`,
      estimate.discountPct > 0 ? `Учтена скидка ${estimate.discountPct}%.` : '',
      '',
      'Смета действительна 14 календарных дней. Готовы обсудить состав работ и сроки.',
      '',
      'С уважением,',
      settings.legalName,
      settings.phone,
      settings.email,
    ].filter(Boolean).join('\n'),
  };
}

export function contractMail(contract: Contract, client: Client | undefined, settings: CompanySettings) {
  return {
    to: client?.email ?? '',
    subject: `Договор ${contract.number}`,
    body: [
      `Здравствуйте, ${client?.fullName ?? ''}!`,
      '',
      `Направляем договор ${contract.number} от ${formatRuDate(contract.date)}.`,
      `Сумма договора: ${amountLine(contract.amount)}`,
      '',
      'График платежей:',
      ...contract.payments.map((p, i) => `${i + 1}. ${p.title} — ${money2(p.amount)} руб.`),
      '',
      'С уважением,',
      settings.legalName,
      settings.phone,
    ].join('\n'),
  };
}

export function actMail(act: Act, client: Client | undefined, settings: CompanySettings) {
  const kindTitle = ACT_TITLES[act.kind];
  return {
    to: client?.email ?? '',
    subject: `${kindTitle} № ${act.number}`,
    body: [
      `Здравствуйте, ${client?.fullName ?? ''}!`,
      '',
      `Направляем ${kindTitle.toLowerCase()} № ${act.number} от ${formatRuDate(act.date)}.`,
      `Сумма: ${amountLine(act.amount)}`,
      '',
      'Просим подписать и вернуть один экземпляр.',
      '',
      'С уважением,',
      settings.legalName,
      settings.phone,
    ].join('\n'),
  };
}

export const ACT_TITLES: Record<Act['kind'], string> = {
  work: 'Акт выполненных работ',
  extra: 'Акт на дополнительные работы',
  hidden: 'Акт освидетельствования скрытых работ',
  transfer: 'Акт приёма-передачи объекта',
};
