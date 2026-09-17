import type { BriefTemplate } from '../types';

/**
 * Бриф замерщика — ТЗ на объекте.
 * Замерщик проходит по чек-листу, ответы подсказывают наборы работ для сметы.
 */
export const BRIEF_TEMPLATE: BriefTemplate = {
  id: 'brief-flat-v1',
  title: 'Замер квартиры / помещения',
  groups: [
    {
      id: 'general',
      title: '1. Общее по объекту',
      questions: [
        { id: 'buildingType', title: 'Тип дома', type: 'select', options: ['Новостройка', 'Вторичка', 'Панель', 'Монолит', 'Кирпич', 'Частный дом'], required: true },
        { id: 'state', title: 'Состояние объекта', type: 'select', options: ['Черновая отделка', 'Предчистовая (White box)', 'С отделкой (под демонтаж)', 'Свежий ремонт'], required: true, suggestBundles: ['Демонтаж «под бетон»'] },
        { id: 'scope', title: 'Объём работ', type: 'select', options: ['Капитальный ремонт', 'Косметический ремонт', 'Частичный ремонт', 'Только черновые', 'Только чистовые'], required: true },
        { id: 'floor', title: 'Этаж', type: 'number' },
        { id: 'lift', title: 'Есть грузовой лифт', type: 'bool', hint: 'Нет лифта → добавить подъём материалов (12.05)' },
        { id: 'parking', title: 'Возможность подъезда и разгрузки', type: 'text' },
        { id: 'design', title: 'Есть дизайн-проект', type: 'bool', hint: 'Если нет — предложить услугу отдела дизайна' },
        { id: 'deadline', title: 'Желаемые сроки начала работ', type: 'text' },
      ],
    },
    {
      id: 'demolition',
      title: '2. Демонтаж и перепланировка',
      questions: [
        { id: 'demolitionWalls', title: 'Демонтаж перегородок', type: 'bool' },
        { id: 'demolitionWallsArea', title: 'Площадь демонтируемых перегородок, м2', type: 'number' },
        { id: 'newWalls', title: 'Возведение новых перегородок', type: 'bool' },
        { id: 'newWallsMaterial', title: 'Материал новых перегородок', type: 'select', options: ['Газоблок 100 мм', 'Кирпич 120 мм', 'ГКЛ каркас', 'Пазогребень'] },
        { id: 'screedDemo', title: 'Демонтаж стяжки', type: 'bool' },
        { id: 'trashAccess', title: 'Как выносится мусор', type: 'select', options: ['Мешками через лифт', 'Мешками без лифта', 'Мусоропровод', 'Контейнер во дворе'] },
      ],
    },
    {
      id: 'engineering',
      title: '3. Инженерные системы',
      questions: [
        { id: 'electricPoints', title: 'Примерное количество электроточек', type: 'number', hint: 'Розетки + выключатели + выводы света', suggestBundles: ['Электрика: черновой этап'] },
        { id: 'shield', title: 'Замена / сборка электрощита', type: 'select', options: ['Не требуется', 'До 12 модулей', 'До 24 модулей', 'Более 24 модулей'] },
        { id: 'plumbingPoints', title: 'Количество точек водоснабжения/канализации', type: 'number' },
        { id: 'heating', title: 'Работы по отоплению', type: 'multi', options: ['Перенос радиаторов', 'Замена радиаторов', 'Тёплый пол водяной', 'Тёплый пол электрический', 'Не требуется'] },
        { id: 'ventilation', title: 'Вентиляция и кондиционирование', type: 'multi', options: ['Вытяжка в санузле', 'Приточная установка', 'Кондиционеры', 'Не требуется'] },
        { id: 'weakCurrent', title: 'Слаботочка (интернет, ТВ, домофон)', type: 'text' },
      ],
    },
    {
      id: 'surfaces',
      title: '4. Поверхности и отделка',
      questions: [
        { id: 'wallsFinish', title: 'Отделка стен', type: 'multi', options: ['Покраска', 'Обои', 'Декоративная штукатурка', 'Плитка', 'Панели'], suggestBundles: ['Стены: штукатурка по маякам', 'Стены под покраску (финиш)'] },
        { id: 'ceilingFinish', title: 'Отделка потолков', type: 'multi', options: ['Покраска', 'Натяжной', 'ГКЛ с покраской', 'Многоуровневый'], suggestBundles: ['Потолок под покраску', 'Потолок ГКЛ'] },
        { id: 'floorFinish', title: 'Напольные покрытия', type: 'multi', options: ['Ламинат', 'Инженерная доска', 'Кварцвинил', 'Керамогранит', 'Ковролин'], suggestBundles: ['Пол: стяжка по маякам'] },
        { id: 'wallsCurve', title: 'Кривизна стен (перепад), мм', type: 'number', hint: 'Больше 30 мм → согласовать доп. слой штукатурки' },
        { id: 'floorDrop', title: 'Перепад пола, мм', type: 'number', hint: 'От перепада зависит толщина стяжки и её стоимость' },
        { id: 'doors', title: 'Количество межкомнатных дверей', type: 'number', suggestBundles: ['Двери и откосы'] },
        { id: 'plinth', title: 'Тип плинтуса', type: 'select', options: ['Напольный МДФ', 'Скрытый', 'Алюминиевый', 'Не требуется'] },
      ],
    },
    {
      id: 'bath',
      title: '5. Санузлы и кухня',
      questions: [
        { id: 'bathCount', title: 'Количество санузлов', type: 'number', suggestBundles: ['Санузел под ключ (черновой этап)', 'Санузел: плитка'] },
        { id: 'bathEquipment', title: 'Сантехника', type: 'multi', options: ['Унитаз подвесной', 'Унитаз напольный', 'Ванна', 'Душевая кабина', 'Душ без поддона (трап)', 'Раковина с тумбой', 'Полотенцесушитель'] },
        { id: 'waterproofing', title: 'Гидроизоляция', type: 'select', options: ['Только санузел', 'Санузел + кухня', 'Вся квартира', 'Не требуется'] },
        { id: 'kitchenTech', title: 'Техника на кухне (встройка)', type: 'text' },
      ],
    },
    {
      id: 'materials',
      title: '6. Материалы и логистика',
      questions: [
        { id: 'materialsBy', title: 'Кто закупает материалы', type: 'select', options: ['Подрядчик', 'Заказчик', 'Смешанно'], required: true },
        { id: 'storage', title: 'Место хранения материалов на объекте', type: 'text' },
        { id: 'water', title: 'Есть вода и электричество на объекте', type: 'bool', required: true },
        { id: 'workHours', title: 'Ограничения по времени работ', type: 'text', hint: 'Режим тишины в доме, пропускной режим' },
      ],
    },
    {
      id: 'final',
      title: '7. Итоги замера',
      questions: [
        { id: 'photos', title: 'Фотофиксация помещений', type: 'photo', hint: 'Каждое помещение: общий вид + проблемные места' },
        { id: 'voice', title: 'Голосовой комментарий по объекту', type: 'text', hint: 'Записывается во вкладке «Вложения»' },
        { id: 'risks', title: 'Риски и особенности объекта', type: 'text' },
        { id: 'clientWishes', title: 'Пожелания заказчика', type: 'text' },
        { id: 'budget', title: 'Ориентир по бюджету заказчика, руб.', type: 'number' },
      ],
    },
  ],
};
