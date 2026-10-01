import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  assignWidgetSlot,
  clearPastReminders,
  createNote as buildNote,
  expiredTrash,
  isEmptyNote,
  touch,
} from '../domain/notes';
import type { Note, NoteKind, Settings, WidgetSlot } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { authenticate } from '../security/auth';
import { deleteNotes, loadNotes, loadSettings, saveNotes, saveSettings } from '../storage/db';
import { onWidgetInteraction, pullWidgetEdits, pushWidgets } from '../widgets/sync';
import { cancelReminder, scheduleReminder } from './reminders';

const newId = () => Crypto.randomUUID();

type Status = 'loading' | 'ready' | 'error';

type StoreValue = {
  status: Status;
  error: string | null;
  notes: Note[];
  settings: Settings;
  /** アプリロック中（生体認証待ち） */
  appLocked: boolean;
  unlockApp: () => Promise<boolean>;
  /** 個別ロックの付箋のうち、このセッションで解除済みのもの */
  isNoteUnlocked: (id: string) => boolean;
  unlockNote: (id: string) => Promise<boolean>;
  /** ロックした直後など、認証なしで解除状態にする */
  keepUnlocked: (id: string) => void;
  createNote: (kind: NoteKind) => Promise<string>;
  updateNote: (id: string, patch: Partial<Note>) => void;
  discardIfEmpty: (id: string) => void;
  moveToTrash: (id: string) => Promise<void>;
  restore: (id: string) => void;
  purge: (ids: string[]) => Promise<void>;
  setWidgetSlot: (id: string, slot: WidgetSlot | null) => void;
  setReminder: (id: string, at: number | null) => Promise<boolean>;
  updateSettings: (patch: Partial<Settings>) => void;
  reload: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [appLocked, setAppLocked] = useState(false);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  const notesRef = useRef<Note[]>([]);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const backgroundAt = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  /** 状態・DB・ウィジェットを同じ順序で更新する */
  const commit = useCallback((next: Note[], changed: Note[]) => {
    notesRef.current = next;
    setNotes(next);
    saveQueue.current = saveQueue.current
      .then(() => saveNotes(changed))
      .then(() => pushWidgets(next))
      .catch((e) => console.warn('[store] save failed', e));
  }, []);

  const mutate = useCallback(
    (fn: (current: Note[]) => Note[]) => {
      const current = notesRef.current;
      const next = fn(current);
      const changed = next.filter((n) => current.find((c) => c.id === n.id) !== n);
      if (changed.length) commit(next, changed);
    },
    [commit],
  );

  const reload = useCallback(async () => {
    try {
      let loaded = await loadNotes();
      const fromWidget = await pullWidgetEdits(loaded);
      if (fromWidget.length) {
        await saveNotes(fromWidget);
        loaded = loaded.map((n) => fromWidget.find((w) => w.id === n.id) ?? n);
      }
      const pastReminders = clearPastReminders(loaded, Date.now());
      if (pastReminders.length) {
        await saveNotes(pastReminders);
        loaded = loaded.map((n) => pastReminders.find((p) => p.id === n.id) ?? n);
      }
      const expired = expiredTrash(loaded, Date.now());
      if (expired.length) {
        await deleteNotes(expired.map((n) => n.id));
        loaded = loaded.filter((n) => !expired.includes(n));
      }
      notesRef.current = loaded;
      setNotes(loaded);
      await pushWidgets(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  // 起動時読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedSettings = await loadSettings();
        if (cancelled) return;
        settingsRef.current = loadedSettings;
        setSettings(loadedSettings);
        setAppLocked(loadedSettings.appLock);
        await reload();
        if (!cancelled) setStatus((s) => (s === 'error' ? s : 'ready'));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // バックグラウンド復帰：自動ロック判定・ウィジェット側の変更取り込み
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
        setUnlockedIds(new Set());
      } else if (state === 'active') {
        const since = backgroundAt.current;
        backgroundAt.current = null;
        const s = settingsRef.current;
        if (since !== null && s.appLock && Date.now() - since >= s.autoLockDelay * 1000) {
          setAppLocked(true);
        }
        if (since !== null) void reload();
      }
    });
    const unsubscribeWidget = onWidgetInteraction(() => void reload());
    return () => {
      sub.remove();
      unsubscribeWidget();
    };
  }, [reload]);

  const unlockApp = useCallback(async () => {
    const ok = await authenticate('付箋メモのロックを解除');
    if (ok) setAppLocked(false);
    return ok;
  }, []);

  const unlockNote = useCallback(async (id: string) => {
    const ok = await authenticate('ロックされた付箋を開く');
    if (ok) setUnlockedIds((prev) => new Set(prev).add(id));
    return ok;
  }, []);

  const keepUnlocked = useCallback((id: string) => setUnlockedIds((prev) => new Set(prev).add(id)), []);

  const isNoteUnlocked = useCallback(
    (id: string) => {
      const note = notesRef.current.find((n) => n.id === id);
      return !note?.locked || unlockedIds.has(id);
    },
    [unlockedIds],
  );

  const createNote = useCallback(
    async (kind: NoteKind) => {
      const note = buildNote(kind, settingsRef.current.defaultColor, Date.now(), newId);
      mutate((current) => [note, ...current]);
      return note.id;
    },
    [mutate],
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) => {
      mutate((current) => current.map((n) => (n.id === id ? touch(n, patch, Date.now()) : n)));
    },
    [mutate],
  );

  const purge = useCallback(
    async (ids: string[]) => {
      const targets = notesRef.current.filter((n) => ids.includes(n.id));
      await Promise.all(targets.map((n) => cancelReminder(n.notificationId)));
      const next = notesRef.current.filter((n) => !ids.includes(n.id));
      notesRef.current = next;
      setNotes(next);
      saveQueue.current = saveQueue.current
        .then(() => deleteNotes(ids))
        .then(() => pushWidgets(next))
        .catch((e) => console.warn('[store] delete failed', e));
    },
    [],
  );

  /** 編集画面を閉じたとき、何も書かれていない新規付箋は残さない */
  const discardIfEmpty = useCallback(
    (id: string) => {
      const note = notesRef.current.find((n) => n.id === id);
      if (note && note.deletedAt === null && isEmptyNote(note) && note.widgetSlot === null && note.reminderAt === null) {
        void purge([id]);
      }
    },
    [purge],
  );

  const moveToTrash = useCallback(
    async (id: string) => {
      const note = notesRef.current.find((n) => n.id === id);
      if (!note) return;
      await cancelReminder(note.notificationId);
      updateNote(id, { deletedAt: Date.now(), widgetSlot: null, reminderAt: null, notificationId: null, pinned: false });
    },
    [updateNote],
  );

  const restore = useCallback((id: string) => updateNote(id, { deletedAt: null }), [updateNote]);

  const setWidgetSlot = useCallback(
    (id: string, slot: WidgetSlot | null) => mutate((current) => assignWidgetSlot(current, id, slot, Date.now())),
    [mutate],
  );

  const setReminder = useCallback(
    async (id: string, at: number | null) => {
      const note = notesRef.current.find((n) => n.id === id);
      if (!note) return false;
      await cancelReminder(note.notificationId);
      if (at === null) {
        updateNote(id, { reminderAt: null, notificationId: null });
        return true;
      }
      const notificationId = await scheduleReminder(note, at, settingsRef.current.hideNotificationContent);
      if (!notificationId) {
        updateNote(id, { reminderAt: null, notificationId: null });
        return false;
      }
      updateNote(id, { reminderAt: at, notificationId });
      return true;
    },
    [updateNote],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    void saveSettings(next).catch((e) => console.warn('[store] settings save failed', e));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      status,
      error,
      notes,
      settings,
      appLocked,
      unlockApp,
      isNoteUnlocked,
      unlockNote,
      keepUnlocked,
      createNote,
      updateNote,
      discardIfEmpty,
      moveToTrash,
      restore,
      purge,
      setWidgetSlot,
      setReminder,
      updateSettings,
      reload,
    }),
    [status, error, notes, settings, appLocked, unlockApp, isNoteUnlocked, unlockNote, keepUnlocked, createNote, updateNote, discardIfEmpty, moveToTrash, restore, purge, setWidgetSlot, setReminder, updateSettings, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used within StoreProvider');
  return value;
}

export function useNote(id: string | undefined): Note | undefined {
  const { notes } = useStore();
  return useMemo(() => notes.find((n) => n.id === id), [notes, id]);
}
