import type { ID, Room } from '../domain/types';
import { Modal, NumInput, TextInput } from './ui';
import { num } from '../lib/money';
import { roomGeometry, totalGeometry } from '../lib/geometry';
import { mkId } from '../lib/id';

/**
 * Габариты помещений. Из них считаются объёмы работ:
 * замерщик вводит длину/ширину/высоту и количество проёмов —
 * площади пола, стен, потолка и погонаж считаются сами.
 */
export default function RoomsEditor({ rooms, onChange, onClose, objectTitle }: {
  rooms: Room[];
  onChange: (rooms: Room[]) => void;
  onClose: () => void;
  objectTitle: string;
}) {
  const patch = (id: ID, p: Partial<Room>) => onChange(rooms.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const add = () => onChange([...rooms, {
    id: mkId('rm-'), name: `Помещение ${rooms.length + 1}`, length: 0, width: 0,
    height: rooms[0]?.height ?? 2.7, doors: 1, windows: 1,
  }]);

  const remove = (id: ID) => onChange(rooms.filter((r) => r.id !== id));

  const total = totalGeometry(rooms);

  return (
    <Modal
      size="xl"
      title={<>Габариты помещений <span className="muted">· {objectTitle}</span></>}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={add}>+ Помещение</button>
        <button className="btn primary" onClick={onClose}>Готово</button>
      </>}
    >
      <div className="note mb-12">
        Площадь стен считается как периметр × высота за вычетом проёмов
        (дверь — 1,8 м², окно — 2,1 м²). Если геометрия сложная, впишите площадь вручную в столбце «Стены, м²».
      </div>

      <div className="table-wrap">
        <table className="tbl compact">
          <thead>
            <tr>
              <th style={{ minWidth: 150 }}>Помещение</th>
              <th className="num">Длина, м</th>
              <th className="num">Ширина, м</th>
              <th className="num">Высота, м</th>
              <th className="num">Двери</th>
              <th className="num">Окна</th>
              <th className="num">Пол, м²</th>
              <th className="num">Стены, м²</th>
              <th className="num">Периметр, м</th>
              <th className="num">Откосы, м.п.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => {
              const g = roomGeometry(r);
              return (
                <tr key={r.id}>
                  <td><TextInput className="compact" value={r.name} onChange={(v) => patch(r.id, { name: v })} /></td>
                  <td className="num" style={{ width: 82 }}><NumInput className="compact" value={r.length} onChange={(v) => patch(r.id, { length: v })} /></td>
                  <td className="num" style={{ width: 82 }}><NumInput className="compact" value={r.width} onChange={(v) => patch(r.id, { width: v })} /></td>
                  <td className="num" style={{ width: 82 }}><NumInput className="compact" value={r.height} onChange={(v) => patch(r.id, { height: v })} /></td>
                  <td className="num" style={{ width: 66 }}><NumInput className="compact" value={r.doors} onChange={(v) => patch(r.id, { doors: v })} /></td>
                  <td className="num" style={{ width: 66 }}><NumInput className="compact" value={r.windows} onChange={(v) => patch(r.id, { windows: v })} /></td>
                  <td className="num strong">{num(g.floor)}</td>
                  <td className="num" style={{ width: 92 }}>
                    <NumInput
                      className="compact"
                      value={r.overrides?.walls ?? Math.round(g.walls * 100) / 100}
                      onChange={(v) => patch(r.id, { overrides: { ...r.overrides, walls: v } })}
                      title="Можно переопределить вручную"
                    />
                  </td>
                  <td className="num">{num(g.perimeter)}</td>
                  <td className="num">{num(g.slopes)}</td>
                  <td className="right">
                    <button className="btn ghost xs" onClick={() => remove(r.id)} title="Удалить помещение">✕</button>
                  </td>
                </tr>
              );
            })}
            {rooms.length === 0 && (
              <tr><td colSpan={11} className="center muted">Помещения не заданы. Нажмите «+ Помещение».</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Итого</td>
              <td colSpan={5} />
              <td className="num">{num(total.floor)}</td>
              <td className="num">{num(total.walls)}</td>
              <td className="num">{num(total.perimeter)}</td>
              <td className="num">{num(total.slopes)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}
