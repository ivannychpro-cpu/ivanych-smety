import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import type { Attachment, Brief, BriefQuestion, ID } from '../domain/types';
import { BRIEF_TEMPLATE } from '../domain/seed/brief';
import { Badge, Card, Empty, Field, Modal, NumInput, Select, Tabs, TextInput, formatDateTime } from '../components/ui';
import { deleteFile, getFileUrl, putFile } from '../store/attachments';
import { addBundle, emptyEstimate } from '../lib/estimateOps';
import { mkId, nextNumber } from '../lib/id';

/**
 * Замер на объекте: бриф-чек-лист, фотофиксация, голосовые комментарии и чертежи.
 * По ответам приложение предлагает наборы работ и собирает черновик сметы.
 */
export default function Briefs() {
  const { db, update, can, currentUser, toast } = useApp();
  const [activeId, setActiveId] = useState<ID | null>(db.briefs[0]?.id ?? null);
  const [showNew, setShowNew] = useState(false);
  const canEdit = can('brief.edit');

  const brief = db.briefs.find((b) => b.id === activeId) ?? null;

  const createBrief = (objectId: ID) => {
    const id = mkId('brf-');
    update((draft) => {
      draft.briefs.unshift({
        id, objectId, measurerId: currentUser!.id, templateId: BRIEF_TEMPLATE.id,
        answers: [], attachments: [], status: 'draft',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      const o = draft.objects.find((x) => x.id === objectId);
      if (o && o.status === 'lead') o.status = 'measured';
    }, { action: 'brief.create', entity: 'brief', entityId: id });
    setActiveId(id);
    setShowNew(false);
    toast('Бриф замера создан', 'success');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Замеры и брифы</h1>
          <p>Чек-лист на объекте: ничего не забыть, всё зафиксировать, быстро собрать смету.</p>
        </div>
        <div className="spacer" />
        {canEdit && <button className="btn primary" onClick={() => setShowNew(true)}>+ Новый замер</button>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
        <Card title="Замеры" bodyClass="tight">
          {db.briefs.length === 0 && <div className="small muted">Замеров пока нет</div>}
          {db.briefs.map((b) => {
            const obj = db.objects.find((o) => o.id === b.objectId);
            const filled = b.answers.filter((a) => a.value !== null && a.value !== '').length;
            return (
              <div
                key={b.id}
                className={`picker-item ${b.id === activeId ? 'active' : ''}`}
                style={{ background: b.id === activeId ? 'var(--accent-soft)' : undefined }}
                onClick={() => setActiveId(b.id)}
              >
                <div className="t">
                  <b>{obj?.title ?? 'Объект удалён'}</b>
                  <span>{filled} ответов · {b.attachments.length} вложений</span>
                </div>
                <Badge kind={b.status === 'done' ? 'green' : undefined}>{b.status === 'done' ? 'готов' : 'черновик'}</Badge>
              </div>
            );
          })}
        </Card>

        {brief ? <BriefEditor brief={brief} readOnly={!canEdit} /> : <Empty icon="📐" title="Выберите замер слева" />}
      </div>

      {showNew && (
        <Modal title="Новый замер" onClose={() => setShowNew(false)}>
          <p className="small muted">Выберите объект — бриф создастся по нему.</p>
          {db.objects.map((o) => (
            <div key={o.id} className="picker-item" onClick={() => createBrief(o.id)}>
              <div className="t">
                <b>{o.title}</b>
                <span>{o.address} · {o.rooms.length} помещений</span>
              </div>
              <button className="btn sm primary">Выбрать</button>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}

function BriefEditor({ brief, readOnly }: { brief: Brief; readOnly: boolean }) {
  const { db, update, toast, currentUser } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<string>(BRIEF_TEMPLATE.groups[0].id);
  const object = db.objects.find((o) => o.id === brief.objectId);

  const answerOf = (qid: string) => brief.answers.find((a) => a.questionId === qid);

  const setAnswer = (qid: string, value: unknown, comment?: string) => {
    update((draft) => {
      const b = draft.briefs.find((x) => x.id === brief.id);
      if (!b) return;
      const existing = b.answers.find((a) => a.questionId === qid);
      if (existing) { existing.value = value as never; if (comment !== undefined) existing.comment = comment; }
      else b.answers.push({ questionId: qid, value: value as never, comment });
      b.updatedAt = new Date().toISOString();
    });
  };

  /** Наборы работ, предложенные по ответам брифа. */
  const suggested = useMemo(() => {
    const titles = new Set<string>();
    for (const g of BRIEF_TEMPLATE.groups) {
      for (const q of g.questions) {
        const a = answerOf(q.id);
        if (!a || !q.suggestBundles) continue;
        const filled = Array.isArray(a.value) ? a.value.length > 0 : a.value !== null && a.value !== '' && a.value !== false;
        if (filled) q.suggestBundles.forEach((t) => titles.add(t));
      }
    }
    return db.bundles.filter((b) => titles.has(b.title));
  }, [brief.answers, db.bundles]);

  const buildEstimate = () => {
    if (!object) return;
    const estId = mkId('est-');
    update((draft) => {
      const est = emptyEstimate({
        number: nextNumber('СМ', draft.estimates.map((e) => e.number)),
        objectId: object.id,
        clientId: object.clientId,
        authorId: currentUser!.id,
        title: `Смета по замеру: ${object.title}`,
        markupPct: draft.settings.defaultMarkupPct,
      });
      est.id = estId;
      const bundles = draft.bundles.filter((b) => suggested.some((s) => s.id === b.id));
      for (const room of object.rooms) {
        for (const b of bundles) addBundle(est, b, draft.catalog, object.rooms, room.id, false);
      }
      est.comment = 'Собрана автоматически по брифу замера. Проверьте объёмы и состав работ.';
      draft.estimates.unshift(est);
      const o = draft.objects.find((x) => x.id === object.id);
      if (o && (o.status === 'lead' || o.status === 'measured')) o.status = 'estimated';
    }, { action: 'estimate.fromBrief', entity: 'brief', entityId: brief.id });
    toast('Черновик сметы собран по брифу', 'success');
    nav(`/estimates/${estId}`);
  };

  return (
    <div>
      <Card
        title={object?.title ?? 'Объект'}
        actions={
          <div className="flex gap-8 wrap">
            {!readOnly && suggested.length > 0 && (
              <button className="btn primary sm" onClick={buildEstimate}>⚡ Собрать смету по брифу ({suggested.length})</button>
            )}
            {!readOnly && (
              <button
                className="btn sm"
                onClick={() => update((draft) => {
                  const b = draft.briefs.find((x) => x.id === brief.id);
                  if (b) b.status = b.status === 'done' ? 'draft' : 'done';
                })}
              >
                {brief.status === 'done' ? 'Вернуть в работу' : '✓ Замер завершён'}
              </button>
            )}
          </div>
        }
      >
        <div className="small muted mb-12">
          {object?.address} · замерщик {db.users.find((u) => u.id === brief.measurerId)?.fullName ?? '—'} ·
          обновлён {formatDateTime(brief.updatedAt)}
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ...BRIEF_TEMPLATE.groups.map((g) => ({ value: g.id, label: g.title })),
            { value: '__files__', label: 'Вложения и голос', count: brief.attachments.length },
          ]}
        />

        {tab === '__files__' ? (
          <Attachments brief={brief} readOnly={readOnly} />
        ) : (
          <div className="grid cols-2">
            {BRIEF_TEMPLATE.groups.find((g) => g.id === tab)?.questions.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={answerOf(q.id)?.value ?? null}
                comment={answerOf(q.id)?.comment}
                readOnly={readOnly}
                onChange={(v, c) => setAnswer(q.id, v, c)}
              />
            ))}
          </div>
        )}
      </Card>

      {suggested.length > 0 && (
        <Card className="mt-16" title="Что предлагается включить в смету" bodyClass="tight">
          <div className="small muted mb-8">Подобрано по вашим ответам. При сборке сметы наборы применяются ко всем помещениям объекта.</div>
          {suggested.map((b) => (
            <div key={b.id} className="hint-row recommended">
              <span>🧩</span>
              <span><b>{b.title}</b> <span className="muted">— {b.items.length} работ</span></span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function QuestionField({ q, value, comment, readOnly, onChange }: {
  q: BriefQuestion;
  value: unknown;
  comment?: string;
  readOnly: boolean;
  onChange: (v: unknown, comment?: string) => void;
}) {
  if (q.type === 'bool') {
    return (
      <div className="field">
        <label className="checkbox">
          <input type="checkbox" disabled={readOnly} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{q.title}</span>
        </label>
        {q.hint && <span className="hint xsmall muted">{q.hint}</span>}
      </div>
    );
  }
  if (q.type === 'multi') {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="field">
        <span className="lbl">{q.title}</span>
        {(q.options ?? []).map((o) => (
          <label className="checkbox" key={o}>
            <input
              type="checkbox" disabled={readOnly} checked={arr.includes(o)}
              onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
            />
            <span>{o}</span>
          </label>
        ))}
        {q.hint && <span className="hint xsmall muted">{q.hint}</span>}
      </div>
    );
  }
  if (q.type === 'select') {
    return (
      <Field label={q.title} hint={q.hint}>
        <Select
          value={(value as string) ?? ''}
          onChange={(v) => onChange(v)}
          disabled={readOnly}
          options={[{ value: '', label: '— не выбрано —' }, ...(q.options ?? []).map((o) => ({ value: o, label: o }))]}
        />
      </Field>
    );
  }
  if (q.type === 'number') {
    return (
      <Field label={q.title} hint={q.hint}>
        <NumInput value={(value as number) ?? 0} onChange={(v) => onChange(v)} disabled={readOnly} />
      </Field>
    );
  }
  if (q.type === 'photo') {
    return (
      <Field label={q.title} hint={q.hint ?? 'Загрузите фото во вкладке «Вложения и голос»'}>
        <TextInput value={(value as string) ?? ''} onChange={(v) => onChange(v)} disabled={readOnly} placeholder="Комментарий к фотофиксации" />
      </Field>
    );
  }
  return (
    <Field label={q.title} hint={q.hint}>
      <textarea
        value={(value as string) ?? ''}
        disabled={readOnly}
        rows={2}
        onChange={(e) => onChange(e.target.value, comment)}
      />
    </Field>
  );
}

/* ─────────── Вложения: фото, чертежи, голосовые ─────────── */

function Attachments({ brief, readOnly }: { brief: Brief; readOnly: boolean }) {
  const { update, toast } = useApp();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const a of brief.attachments) {
        const url = await getFileUrl(a.id);
        if (url) next[a.id] = url;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => { cancelled = true; };
  }, [brief.attachments]);

  const addFiles = async (files: FileList | null, kind: Attachment['kind']) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = mkId('att-');
      await putFile(id, file);
      update((draft) => {
        const b = draft.briefs.find((x) => x.id === brief.id);
        b?.attachments.push({
          id, name: file.name, mime: file.type || 'application/octet-stream', size: file.size,
          kind, createdAt: new Date().toISOString(),
        });
        if (b) b.updatedAt = new Date().toISOString();
      });
    }
    toast('Файлы загружены', 'success');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        const id = mkId('att-');
        await putFile(id, blob);
        update((draft) => {
          const b = draft.briefs.find((x) => x.id === brief.id);
          b?.attachments.push({
            id, name: `Голосовой комментарий ${new Date().toLocaleTimeString('ru-RU')}`,
            mime: blob.type, size: blob.size, kind: 'audio', createdAt: new Date().toISOString(),
          });
        });
        stream.getTracks().forEach((t) => t.stop());
        toast('Голосовой комментарий сохранён', 'success');
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      toast('Микрофон недоступен. Загрузите аудиофайл вручную.', 'error');
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  };

  const removeAttachment = async (id: string) => {
    await deleteFile(id);
    update((draft) => {
      const b = draft.briefs.find((x) => x.id === brief.id);
      if (b) b.attachments = b.attachments.filter((a) => a.id !== id);
    });
  };

  return (
    <>
      {!readOnly && (
        <div className="grid cols-3 mb-16">
          <label className="dropzone">
            📷 Фото объекта
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files, 'photo')} />
          </label>
          <label className="dropzone">
            📐 Чертёж / план
            <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files, 'drawing')} />
          </label>
          <div className="dropzone" onClick={recording ? stopRecording : startRecording} style={{ borderColor: recording ? 'var(--red)' : undefined }}>
            {recording ? '⏹ Остановить запись' : '🎙 Записать голосовой комментарий'}
          </div>
        </div>
      )}

      {brief.attachments.length === 0 ? (
        <Empty icon="📎" title="Вложений пока нет" hint="Фото помещений, план с размерами, голосовой комментарий по объекту." />
      ) : (
        <div className="attach-grid">
          {brief.attachments.map((a) => (
            <div key={a.id} className="attach-item">
              {a.kind === 'photo' && urls[a.id] && <img src={urls[a.id]} alt={a.name} />}
              {a.kind === 'audio' && urls[a.id] && <audio controls src={urls[a.id]} />}
              {a.kind === 'drawing' && urls[a.id] && (a.mime.startsWith('image/')
                ? <img src={urls[a.id]} alt={a.name} />
                : <a className="btn sm block mb-8" href={urls[a.id]} target="_blank" rel="noreferrer">Открыть файл</a>)}
              <div className="strong xsmall" style={{ wordBreak: 'break-word' }}>{a.name}</div>
              <div className="xsmall muted">{Math.round(a.size / 1024)} КБ</div>
              {a.kind === 'audio' && (
                <textarea
                  className="mt-8"
                  rows={2}
                  placeholder="Расшифровка голосового…"
                  value={a.transcript ?? ''}
                  disabled={readOnly}
                  onChange={(e) => update((draft) => {
                    const att = draft.briefs.find((x) => x.id === brief.id)?.attachments.find((x) => x.id === a.id);
                    if (att) att.transcript = e.target.value;
                  })}
                />
              )}
              {!readOnly && <button className="btn ghost xs mt-8" onClick={() => removeAttachment(a.id)}>Удалить</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
