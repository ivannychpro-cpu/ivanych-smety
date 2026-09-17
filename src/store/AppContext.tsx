import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditEvent, DB, ID, Permission, User } from '../domain/types';
import { effectivePermissions } from '../domain/permissions';
import { loadDB, resetDB, saveDB } from './db';
import { mkId } from '../lib/id';

interface AppContextValue {
  db: DB;
  /** Изменить базу: мутировать черновик и сохранить. */
  update: (mutate: (draft: DB) => void, audit?: Omit<AuditEvent, 'id' | 'at' | 'userId'>) => void;
  currentUser: User | null;
  permissions: Set<Permission>;
  can: (...perms: Permission[]) => boolean;
  canAny: (...perms: Permission[]) => boolean;
  login: (userId: ID) => void;
  logout: () => void;
  reset: () => void;
  importDB: (json: string) => { ok: boolean; error?: string };
  toast: (message: string, kind?: 'info' | 'error' | 'success') => void;
  toasts: { id: string; message: string; kind: string }[];
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => loadDB());
  const [toasts, setToasts] = useState<{ id: string; message: string; kind: string }[]>([]);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDB(db), 200);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [db]);

  const toast = useCallback((message: string, kind: 'info' | 'error' | 'success' = 'info') => {
    const id = mkId('t-');
    setToasts((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const update = useCallback<AppContextValue['update']>((mutate, audit) => {
    setDb((prev) => {
      const draft: DB = structuredClone(prev);
      mutate(draft);
      if (audit && draft.currentUserId) {
        draft.audit = [
          { id: mkId('aud-'), at: new Date().toISOString(), userId: draft.currentUserId, ...audit },
          ...draft.audit,
        ].slice(0, 500);
      }
      return draft;
    });
  }, []);

  const currentUser = useMemo(
    () => db.users.find((u) => u.id === db.currentUserId) ?? null,
    [db.users, db.currentUserId],
  );

  const permissions = useMemo(() => effectivePermissions(currentUser, db.roles), [currentUser, db.roles]);

  const can = useCallback((...perms: Permission[]) => perms.every((p) => permissions.has(p)), [permissions]);
  const canAny = useCallback((...perms: Permission[]) => perms.some((p) => permissions.has(p)), [permissions]);

  const login = useCallback((userId: ID) => {
    setDb((prev) => ({ ...prev, currentUserId: userId }));
  }, []);

  const logout = useCallback(() => {
    setDb((prev) => ({ ...prev, currentUserId: null }));
  }, []);

  const reset = useCallback(() => {
    setDb(resetDB());
    toast('База сброшена к демонстрационным данным', 'success');
  }, [toast]);

  const importDB = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as DB;
      if (!parsed.users || !parsed.catalog) return { ok: false, error: 'Файл не похож на выгрузку базы' };
      setDb(parsed);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, []);

  const value: AppContextValue = {
    db, update, currentUser, permissions, can, canAny, login, logout, reset, importDB, toast, toasts,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp вне AppProvider');
  return ctx;
}

/* Удобные селекторы */

export function useCatalogIndex() {
  const { db } = useApp();
  return useMemo(() => {
    const byId = new Map(db.catalog.map((c) => [c.id, c]));
    const byCode = new Map(db.catalog.map((c) => [c.code, c]));
    const sections = new Map(db.sections.map((s) => [s.id, s]));
    return { byId, byCode, sections };
  }, [db.catalog, db.sections]);
}

export function useUserName() {
  const { db } = useApp();
  return useCallback(
    (id?: ID | null) => (id ? db.users.find((u) => u.id === id)?.fullName ?? '—' : '—'),
    [db.users],
  );
}
