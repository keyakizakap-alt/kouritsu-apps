import { DEFAULT_SETTINGS } from '../domain/types';
import type { ChecklistItem, Note, Settings, StickyColorId, WidgetSlot } from '../domain/types';

export type NoteRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  items: string;
  color: string;
  pinned: number;
  locked: number;
  widget_slot: number | null;
  reminder_at: number | null;
  notification_id: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
};

function parseItems(json: string): ChecklistItem[] {
  try {
    const value = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value
      .filter((i) => i && typeof i.id === 'string')
      .map((i) => ({ id: i.id, text: String(i.text ?? ''), checked: Boolean(i.checked) }));
  } catch {
    return [];
  }
}

function toSlot(value: number | null): WidgetSlot | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

export function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    kind: row.kind === 'checklist' ? 'checklist' : 'text',
    title: row.title,
    body: row.body,
    items: parseItems(row.items),
    color: row.color as StickyColorId,
    pinned: row.pinned === 1,
    locked: row.locked === 1,
    widgetSlot: toSlot(row.widget_slot),
    reminderAt: row.reminder_at,
    notificationId: row.notification_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function noteToParams(note: Note): (string | number | null)[] {
  return [
    note.id,
    note.kind,
    note.title,
    note.body,
    JSON.stringify(note.items),
    note.color,
    note.pinned ? 1 : 0,
    note.locked ? 1 : 0,
    note.widgetSlot,
    note.reminderAt,
    note.notificationId,
    note.deletedAt,
    note.createdAt,
    note.updatedAt,
  ];
}

/** 保存済み設定に新しい項目が無い場合でも既定値で補う */
export function parseSettings(json: string | null): Settings {
  if (!json) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(json);
    return { ...DEFAULT_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
