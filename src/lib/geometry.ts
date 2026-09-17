import type { QtyBasis, Room } from '../domain/types';

/** Стандартные размеры проёмов для вычета из площади стен. */
export const DOOR_AREA = 2.0 * 0.9;    // 1,8 м2
export const WINDOW_AREA = 1.5 * 1.4;  // 2,1 м2
export const DOOR_SLOPE = 2.0 * 2 + 0.9;    // погонаж откоса двери
export const WINDOW_SLOPE = (1.5 + 1.4) * 2;

export interface RoomGeometry {
  floor: number;
  ceiling: number;
  walls: number;       // за вычетом проёмов
  wallsGross: number;  // без вычета
  perimeter: number;
  slopes: number;
  openings: number;
  volume: number;
}

export function roomGeometry(room: Room): RoomGeometry {
  const l = Math.max(0, room.length || 0);
  const w = Math.max(0, room.width || 0);
  const h = Math.max(0, room.height || 0);

  const perimeter = 2 * (l + w);
  const floor = l * w;
  const wallsGross = perimeter * h;
  const openingsArea = (room.doors || 0) * DOOR_AREA + (room.windows || 0) * WINDOW_AREA;
  const walls = Math.max(0, wallsGross - openingsArea - (room.extraDeduction || 0));
  const slopes = (room.doors || 0) * DOOR_SLOPE + (room.windows || 0) * WINDOW_SLOPE;

  const g: RoomGeometry = {
    floor,
    ceiling: floor,
    walls,
    wallsGross,
    perimeter,
    slopes,
    openings: (room.doors || 0) + (room.windows || 0),
    volume: floor * h,
  };

  // Ручные переопределения, если геометрия нестандартная.
  const o = room.overrides;
  if (o) {
    if (o.floor != null) { g.floor = o.floor; g.volume = o.floor * h; }
    if (o.ceiling != null) g.ceiling = o.ceiling;
    if (o.walls != null) g.walls = o.walls;
    if (o.perimeter != null) g.perimeter = o.perimeter;
    if (o.slopes != null) g.slopes = o.slopes;
  }
  return g;
}

/** Объём работы по базе расчёта и геометрии помещения. */
export function qtyFromBasis(basis: QtyBasis, room: Room | undefined, factor = 1): number | null {
  if (!room || basis === 'manual') return null;
  const g = roomGeometry(room);
  const map: Record<Exclude<QtyBasis, 'manual'>, number> = {
    floor: g.floor,
    ceiling: g.ceiling,
    walls: g.walls,
    wallsGross: g.wallsGross,
    perimeter: g.perimeter,
    slopes: g.slopes,
    openings: g.openings,
    volume: g.volume,
    rooms: 1,
  };
  const base = map[basis as Exclude<QtyBasis, 'manual'>];
  if (base == null) return null;
  return round2(base * (factor || 1));
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export const QTY_BASIS_TITLES: Record<QtyBasis, string> = {
  manual: 'вручную',
  floor: 'площадь пола',
  ceiling: 'площадь потолка',
  walls: 'площадь стен (за вычетом проёмов)',
  wallsGross: 'площадь стен (без вычета)',
  perimeter: 'периметр',
  slopes: 'откосы, п.м.',
  openings: 'проёмы, шт',
  volume: 'объём, м3',
  rooms: 'на помещение',
};

export const QTY_BASIS_SHORT: Record<QtyBasis, string> = {
  manual: '—',
  floor: 'пол',
  ceiling: 'потолок',
  walls: 'стены',
  wallsGross: 'стены бр.',
  perimeter: 'периметр',
  slopes: 'откосы',
  openings: 'проёмы',
  volume: 'объём',
  rooms: 'помещ.',
};

/** Сумма геометрии по всем помещениям объекта. */
export function totalGeometry(rooms: Room[]): RoomGeometry {
  return rooms.reduce<RoomGeometry>(
    (acc, r) => {
      const g = roomGeometry(r);
      return {
        floor: acc.floor + g.floor,
        ceiling: acc.ceiling + g.ceiling,
        walls: acc.walls + g.walls,
        wallsGross: acc.wallsGross + g.wallsGross,
        perimeter: acc.perimeter + g.perimeter,
        slopes: acc.slopes + g.slopes,
        openings: acc.openings + g.openings,
        volume: acc.volume + g.volume,
      };
    },
    { floor: 0, ceiling: 0, walls: 0, wallsGross: 0, perimeter: 0, slopes: 0, openings: 0, volume: 0 },
  );
}
