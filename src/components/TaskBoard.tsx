import { useState } from 'react';
import { useApp } from '../store/AppContext';
import type { Task } from '../domain/types';
import { Badge, Card, Empty, Field, Modal, Select, TextInput, formatDate, toDateInput } from '../components/ui';
import { mkId } from '../lib/id';
import { TASK_STATUS } from '../pages/Dashboard';

const COLUMNS: Task['status'][] = ['new', 'inWork', 'review', 'done', 'blocked'];

/** Доска задач отдела. Дизайн и производство идут параллельно, но задачи могут ждать друг друга. */
export default function TaskBoard({ department, canEdit, title, hint }: {
  department: 'design' | 'production'; canEdit: boolean; title: string; hint: string;
}) {
  const { db, update, toast } = useApp();
  const [editing, setEditing] = useState<Task | null>(null);
  const tasks = db.tasks.filter((t) => t.department === department);

  const setStatus = (id: string, status: Task['status']) => {
    update((draft) => {
      const t = draft.tasks.find((x) => x.id === id);
      if (!t) return;
      t.status = status;
      t.factEnd = status === 'done' ? new Date().toISOString() : null;
      if (status === 'done') {
        // Задачи, ожидавшие эту, разблокируются автоматически.
        for (const dep of draft.tasks.filter((x) => x.dependsOnTaskId === id && x.status === 'blocked')) dep.status = 'new';
      }
    }, { action: 'task.status', entity: 'task', entityId: id, details: status });
  };

  return (
    <>
      <div className="page-head">
        <div><h1>{title}</h1><p>{hint}</p></div>
        <div className="spacer" />
        {canEdit && (
          <button
            className="btn primary"
            onClick={() => setEditing({
              id: mkId('tsk-'), objectId: db.objects[0]?.id ?? '', title: '', department,
              status: 'new', createdAt: new Date().toISOString(),
            })}
          >
            + Задача
          </button>
        )}
      </div>

      {tasks.length === 0 ? <Empty icon="🗂" title="Задач нет" /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col);
            return (
              <Card key={col} title={`${TASK_STATUS[col]} · ${colTasks.length}`} bodyClass="tight">
                {colTasks.length === 0 && <div className="xsmall muted">пусто</div>}
                {colTasks.map((t) => {
                  const object = db.objects.find((o) => o.id === t.objectId);
                  const blocker = t.dependsOnTaskId ? db.tasks.find((x) => x.id === t.dependsOnTaskId) : null;
                  const overdue = t.status !== 'done' && t.plannedEnd && t.plannedEnd < new Date().toISOString();
                  return (
                    <div key={t.id} className="bundle-card mb-8" onClick={() => canEdit && setEditing(t)}>
                      <b>{t.title}</b>
                      <div className="d">{object?.title ?? '—'}</div>
                      <div className="chain">
                        срок {formatDate(t.plannedEnd)}
                        {overdue && <span className="neg"> · просрочено</span>}
                      </div>
                      {blocker && <div className="xsmall muted">ждёт: {blocker.title}</div>}
                      {t.note && <div className="xsmall muted">{t.note}</div>}
                      {t.assigneeId && <div className="xsmall muted">{db.users.find((u) => u.id === t.assigneeId)?.fullName}</div>}
                      {canEdit && (
                        <div className="flex gap-8 mt-8 wrap" onClick={(e) => e.stopPropagation()}>
                          {COLUMNS.filter((c) => c !== col).map((c) => (
                            <button key={c} className="btn xs" onClick={() => setStatus(t.id, c)}>{TASK_STATUS[c]}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-16" title="Связь дизайна и производства" bodyClass="tight">
        <div className="small muted mb-8">
          Задачи производства могут зависеть от результата дизайна: пока задача дизайна не закрыта,
          связанная задача производства стоит в статусе «Блокировано» и разблокируется автоматически.
        </div>
        <div className="table-wrap">
          <table className="tbl compact">
            <thead><tr><th>Объект</th><th>Дизайн</th><th>Производство</th><th>Ожидание</th></tr></thead>
            <tbody>
              {db.objects.map((o) => {
                const design = db.tasks.filter((t) => t.objectId === o.id && t.department === 'design');
                const prod = db.tasks.filter((t) => t.objectId === o.id && t.department === 'production');
                if (design.length === 0 && prod.length === 0) return null;
                const waiting = prod.filter((t) => t.status === 'blocked');
                return (
                  <tr key={o.id}>
                    <td className="small">{o.title}</td>
                    <td className="small">{design.filter((t) => t.status === 'done').length} из {design.length} готово</td>
                    <td className="small">{prod.filter((t) => t.status === 'done').length} из {prod.length} готово</td>
                    <td>{waiting.length ? <Badge kind="red">{waiting.length} задач ждут</Badge> : <Badge kind="green">нет блокировок</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <TaskDialog
          task={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            update((draft) => {
              const idx = draft.tasks.findIndex((x) => x.id === t.id);
              if (idx >= 0) draft.tasks[idx] = t; else draft.tasks.push(t);
            }, { action: 'task.save', entity: 'task', entityId: t.id, details: t.title });
            setEditing(null);
            toast('Задача сохранена', 'success');
          }}
        />
      )}
    </>
  );
}

function TaskDialog({ task, onSave, onClose }: { task: Task; onSave: (t: Task) => void; onClose: () => void }) {
  const { db } = useApp();
  const [d, setD] = useState<Task>(task);
  const set = (p: Partial<Task>) => setD((x) => ({ ...x, ...p }));

  return (
    <Modal
      title={task.title || 'Новая задача'}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!d.title || !d.objectId} onClick={() => onSave(d)}>Сохранить</button>
      </>}
    >
      <Field label="Название"><TextInput value={d.title} onChange={(v) => set({ title: v })} /></Field>
      <div className="grid cols-2">
        <Field label="Объект">
          <Select value={d.objectId} onChange={(v) => set({ objectId: v })} options={db.objects.map((o) => ({ value: o.id, label: o.title }))} />
        </Field>
        <Field label="Исполнитель">
          <Select
            value={d.assigneeId ?? ''}
            onChange={(v) => set({ assigneeId: v || undefined })}
            options={[{ value: '', label: '— не назначен —' },
              ...db.users.filter((u) => u.departmentCode === (d.department === 'design' ? 'design' : 'production'))
                .map((u) => ({ value: u.id, label: u.fullName }))]}
          />
        </Field>
      </div>
      <div className="grid cols-2">
        <Field label="Начало">
          <input type="date" value={toDateInput(d.plannedStart)} onChange={(e) => set({ plannedStart: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
        </Field>
        <Field label="Срок">
          <input type="date" value={toDateInput(d.plannedEnd)} onChange={(e) => set({ plannedEnd: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
        </Field>
      </div>
      <Field label="Ждёт завершения задачи" hint="например, производство ждёт раскладку плитки от дизайна">
        <Select
          value={d.dependsOnTaskId ?? ''}
          onChange={(v) => set({ dependsOnTaskId: v || null })}
          options={[{ value: '', label: '— нет зависимости —' },
            ...db.tasks.filter((t) => t.id !== d.id && t.objectId === d.objectId).map((t) => ({ value: t.id, label: `${t.title} (${t.department === 'design' ? 'дизайн' : 'производство'})` }))]}
        />
      </Field>
      <Field label="Комментарий"><TextInput value={d.note ?? ''} onChange={(v) => set({ note: v })} /></Field>
    </Modal>
  );
}
