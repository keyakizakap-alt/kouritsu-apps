import { createNote } from '../domain/notes';
import type { Note, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

/**
 * Web はデザイン確認用のプレビュー専用（本番は iOS / Android）。
 * データはメモリ上にのみ置き、ページを閉じると消える。サンプルの付箋を表示する。
 */
let seq = 0;
const id = () => `demo-${++seq}`;
const now = Date.now();

function demo(): Note[] {
  const base = (kind: 'text' | 'checklist', color: Note['color'], minutesAgo: number, patch: Partial<Note>): Note => ({
    ...createNote(kind, color, now - minutesAgo * 60000, id),
    ...patch,
  });
  return [
    base('checklist', 'lemon', 5, {
      title: '今日やること',
      pinned: true,
      widgetSlot: 1,
      items: [
        { id: id(), text: '企画書のドラフトを送る', checked: true },
        { id: id(), text: '14:00 定例ミーティング', checked: false },
        { id: id(), text: '経費精算', checked: false },
        { id: id(), text: '資料の誤字チェック', checked: false },
      ],
    }),
    base('text', 'sky', 30, { title: 'アイデア', body: 'ホーム画面に貼れる付箋。\n色で分類して、チェックリストはウィジェットから直接チェック。' }),
    base('checklist', 'mint', 60, {
      title: '買い物',
      reminderAt: now + 3 * 3600000,
      items: [
        { id: id(), text: '牛乳', checked: false },
        { id: id(), text: '卵', checked: true },
        { id: id(), text: 'コーヒー豆', checked: false },
      ],
    }),
    base('text', 'rose', 120, { title: '電話番号メモ', body: '', locked: true }),
    base('text', 'lavender', 300, { title: '読みたい本', body: '・イシューからはじめよ\n・エッセンシャル思考' }),
    base('text', 'peach', 600, { title: '', body: 'ゴミ出しは火曜と金曜' }),
  ];
}

let notes: Note[] = demo();
const kv = new Map<string, string>();

export async function getDb(): Promise<never> {
  throw new Error('Web プレビューでは DB を使用しません');
}

export async function loadNotes(): Promise<Note[]> {
  return notes.slice();
}

export async function saveNotes(changed: Note[]): Promise<void> {
  for (const n of changed) {
    const i = notes.findIndex((x) => x.id === n.id);
    if (i >= 0) notes[i] = n;
    else notes.push(n);
  }
}

export async function deleteNotes(ids: string[]): Promise<void> {
  notes = notes.filter((n) => !ids.includes(n.id));
}

export async function getKV(key: string): Promise<string | null> {
  return kv.get(key) ?? null;
}

export async function setKV(key: string, value: string): Promise<void> {
  kv.set(key, value);
}

export async function loadSettings(): Promise<Settings> {
  return DEFAULT_SETTINGS;
}

export async function saveSettings(): Promise<void> {}
