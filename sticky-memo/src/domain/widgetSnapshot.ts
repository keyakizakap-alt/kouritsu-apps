import { type PaperTone, stickyColor } from './palette';
import { checklistProgress, displayTitle, isChecklistDone, touch } from './notes';
import type { Note, NoteKind, WidgetSlot } from './types';
import { WIDGET_SLOTS } from './types';

/**
 * ウィジェットに渡すデータ。ウィジェット側はアプリのサンドボックス外（App Group /
 * ホーム画面）で描画されるため、ここに入れた内容だけが外に出る。ロック中の付箋は中身を入れない。
 */
export type WidgetItem = { id: string; text: string; checked: boolean };

export type WidgetNote = {
  id: string;
  slot: WidgetSlot;
  kind: NoteKind;
  locked: boolean;
  title: string;
  body: string;
  /** ウィジェットに表示するメモ本文（テキスト形式）。本文が空ならタイトルを使う */
  text: string;
  items: WidgetItem[];
  /** iPhone の外観（ライト／ダーク）に合わせてウィジェット側で選ぶ */
  light: PaperTone;
  dark: PaperTone;
  done: boolean;
  progress: string;
  /** ウィジェットに載せきれなかった項目の件数（進捗表示用） */
  extraDone: number;
  extraTotal: number;
  /** 送信時点の note.updatedAt。ウィジェット側の変更を取り込むときの競合判定に使う */
  rev: number;
  /** ウィジェット上でチェックが変更されたか */
  edited: boolean;
};

export type WidgetProps = {
  /** index 0 = スロット1 */
  slots: (WidgetNote | null)[];
  generatedAt: number;
};

export const WIDGET_MAX_ITEMS = 12;
export const WIDGET_MAX_BODY = 400;

export function toWidgetNote(note: Note, slot: WidgetSlot): WidgetNote {
  const c = stickyColor(note.color);
  const base = {
    id: note.id,
    slot,
    kind: note.kind,
    light: c.light,
    dark: c.dark,
    rev: note.updatedAt,
    edited: false,
  };
  if (note.locked) {
    return { ...base, locked: true, title: '', body: '', text: '', items: [], done: false, progress: '', extraDone: 0, extraTotal: 0 };
  }
  const { done, total } = checklistProgress(note);
  const filled = note.items.filter((i) => i.text.trim() !== '');
  const hidden = filled.slice(WIDGET_MAX_ITEMS);
  return {
    ...base,
    locked: false,
    title: displayTitle(note),
    body: note.kind === 'text' ? note.body.slice(0, WIDGET_MAX_BODY) : '',
    text: note.kind === 'text' ? (note.body.trim() ? note.body : note.title).trim().slice(0, WIDGET_MAX_BODY) : '',
    items:
      note.kind === 'checklist'
        ? filled
            .slice(0, WIDGET_MAX_ITEMS)
            .map((i) => ({ id: i.id, text: i.text, checked: i.checked }))
        : [],
    done: isChecklistDone(note),
    progress: note.kind === 'checklist' && total > 0 ? `${done}/${total}` : '',
    extraDone: hidden.filter((i) => i.checked).length,
    extraTotal: hidden.length,
  };
}

export function buildWidgetProps(notes: Note[], now: number): WidgetProps {
  const live = notes.filter((n) => n.deletedAt === null);
  return {
    slots: WIDGET_SLOTS.map((slot) => {
      const note = live.find((n) => n.widgetSlot === slot);
      return note ? toWidgetNote(note, slot) : null;
    }),
    generatedAt: now,
  };
}

/**
 * ウィジェット上でのチェック操作をアプリの DB に取り込む。
 * アプリ側で送信後に編集されていた場合（updatedAt !== rev）はアプリ側を優先する。
 */
export function mergeWidgetEdits(notes: Note[], props: WidgetProps | null | undefined, now: number): Note[] {
  if (!props) return [];
  const changed: Note[] = [];
  for (const wn of props.slots) {
    if (!wn || !wn.edited || wn.locked) continue;
    const note = notes.find((n) => n.id === wn.id);
    if (!note || note.deletedAt !== null || note.updatedAt !== wn.rev) continue;
    const checkedById = new Map(wn.items.map((i) => [i.id, i.checked]));
    let dirty = false;
    const items = note.items.map((i) => {
      const w = checkedById.get(i.id);
      if (w === undefined || w === i.checked) return i;
      dirty = true;
      return { ...i, checked: w };
    });
    if (dirty) changed.push(touch(note, { items }, now));
  }
  return changed;
}

/** ウィジェット内のボタン操作と同じ計算（iOS ウィジェットは関数外を参照できないため本体は複製している） */
export function toggleInWidgetProps(props: WidgetProps, noteId: string, itemId: string): WidgetProps {
  return {
    ...props,
    slots: props.slots.map((wn) => {
      if (!wn || wn.id !== noteId) return wn;
      const items = wn.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i));
      const doneCount = items.filter((i) => i.checked).length + wn.extraDone;
      const total = items.length + wn.extraTotal;
      const done = total > 0 && doneCount === total;
      const progress = `${doneCount}/${total}`;
      return { ...wn, items, done, progress, edited: true };
    }),
  };
}
