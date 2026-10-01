import { colorOrder } from './palette';
import type { ChecklistItem, Note, NoteKind, SortMode, StickyColorId, WidgetSlot } from './types';

export type IdFactory = () => string;

let fallbackCounter = 0;
/** テスト・Web 用の簡易 ID。アプリ本体では expo-crypto の randomUUID を注入する */
export const simpleId: IdFactory = () =>
  `${Date.now().toString(36)}-${(fallbackCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createNote(
  kind: NoteKind,
  color: StickyColorId,
  now: number,
  newId: IdFactory = simpleId,
): Note {
  return {
    id: newId(),
    kind,
    title: '',
    body: '',
    items: kind === 'checklist' ? [{ id: newId(), text: '', checked: false }] : [],
    color,
    pinned: false,
    locked: false,
    widgetSlot: null,
    reminderAt: null,
    notificationId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function touch(note: Note, patch: Partial<Note>, now: number): Note {
  return { ...note, ...patch, updatedAt: now };
}

export function isEmptyNote(note: Note): boolean {
  return (
    note.title.trim() === '' &&
    note.body.trim() === '' &&
    note.items.every((i) => i.text.trim() === '')
  );
}

/** ColorNote と同じく「全項目にチェックが付いたらタイトルにも取り消し線」 */
export function isChecklistDone(note: Note): boolean {
  const filled = note.items.filter((i) => i.text.trim() !== '');
  return note.kind === 'checklist' && filled.length > 0 && filled.every((i) => i.checked);
}

export function checklistProgress(note: Note): { done: number; total: number } {
  const filled = note.items.filter((i) => i.text.trim() !== '');
  return { done: filled.filter((i) => i.checked).length, total: filled.length };
}

export function toggleItem(items: ChecklistItem[], itemId: string): ChecklistItem[] {
  return items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i));
}

export function moveItem(items: ChecklistItem[], itemId: string, delta: -1 | 1): ChecklistItem[] {
  const from = items.findIndex((i) => i.id === itemId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** チェック済みを下にまとめる（ColorNote の「チェック済みを下へ」） */
export function sinkChecked(items: ChecklistItem[]): ChecklistItem[] {
  return [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)];
}

export function uncheckAll(items: ChecklistItem[]): ChecklistItem[] {
  return items.map((i) => (i.checked ? { ...i, checked: false } : i));
}

/** テキスト ⇔ チェックリスト変換（行単位） */
export function convertKind(note: Note, to: NoteKind, newId: IdFactory = simpleId): Pick<Note, 'kind' | 'body' | 'items'> {
  if (note.kind === to) return { kind: note.kind, body: note.body, items: note.items };
  if (to === 'checklist') {
    const lines = note.body.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    const items = (lines.length ? lines : ['']).map((text) => ({ id: newId(), text, checked: false }));
    return { kind: 'checklist', body: '', items };
  }
  const body = note.items
    .filter((i) => i.text.trim() !== '')
    .map((i) => i.text)
    .join('\n');
  return { kind: 'text', body, items: [] };
}

export function noteText(note: Note): string {
  return note.kind === 'text' ? note.body : note.items.map((i) => i.text).join('\n');
}

export function displayTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const first = noteText(note).split('\n').find((l) => l.trim() !== '');
  return first?.trim() ?? '';
}

export type NoteQuery = {
  search: string;
  colors: StickyColorId[];
  sort: SortMode;
};

export function matchesSearch(note: Note, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  // ロック中の付箋は本文を検索対象にしない（タイトルのみ）
  const haystack = note.locked ? note.title : `${note.title}\n${noteText(note)}`;
  return haystack.toLowerCase().includes(q);
}

export function compareNotes(sort: SortMode): (a: Note, b: Note) => number {
  return (a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (sort) {
      case 'created':
        return b.createdAt - a.createdAt;
      case 'color':
        return colorOrder(a.color) - colorOrder(b.color) || b.updatedAt - a.updatedAt;
      case 'title':
        return displayTitle(a).localeCompare(displayTitle(b), 'ja');
      case 'reminder': {
        const ar = a.reminderAt ?? Number.POSITIVE_INFINITY;
        const br = b.reminderAt ?? Number.POSITIVE_INFINITY;
        return ar - br || b.updatedAt - a.updatedAt;
      }
      case 'updated':
      default:
        return b.updatedAt - a.updatedAt;
    }
  };
}

export function selectVisibleNotes(notes: Note[], query: NoteQuery): Note[] {
  return notes
    .filter((n) => n.deletedAt === null)
    .filter((n) => query.colors.length === 0 || query.colors.includes(n.color))
    .filter((n) => matchesSearch(n, query.search))
    .sort(compareNotes(query.sort));
}

export function selectTrash(notes: Note[]): Note[] {
  return notes.filter((n) => n.deletedAt !== null).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** ゴミ箱の自動削除（ColorNote 同様、一定期間で完全削除） */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function expiredTrash(notes: Note[], now: number): Note[] {
  return notes.filter((n) => n.deletedAt !== null && now - n.deletedAt > TRASH_RETENTION_MS);
}

/** 1スロットに1枚。割り当てると既存の付箋はスロットから外す */
export function assignWidgetSlot(notes: Note[], noteId: string, slot: WidgetSlot | null, now: number): Note[] {
  return notes.map((n) => {
    if (n.id === noteId) return n.widgetSlot === slot ? n : touch(n, { widgetSlot: slot }, now);
    if (slot !== null && n.widgetSlot === slot) return touch(n, { widgetSlot: null }, now);
    return n;
  });
}

/** 通知済み（過去）のリマインダーを外す */
export function clearPastReminders(notes: Note[], now: number): Note[] {
  return notes
    .filter((n) => n.reminderAt !== null && n.reminderAt <= now)
    .map((n) => ({ ...n, reminderAt: null, notificationId: null }));
}
