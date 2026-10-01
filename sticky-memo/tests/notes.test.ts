import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignWidgetSlot,
  clearPastReminders,
  convertKind,
  createNote,
  expiredTrash,
  isChecklistDone,
  isEmptyNote,
  moveItem,
  selectTrash,
  selectVisibleNotes,
  sinkChecked,
  toggleItem,
  TRASH_RETENTION_MS,
} from '../src/domain/notes';
import type { Note } from '../src/domain/types';

let seq = 0;
const id = () => `id${++seq}`;

function note(patch: Partial<Note> = {}): Note {
  return { ...createNote('text', 'lemon', 1000, id), ...patch };
}

describe('チェックリスト', () => {
  const list = () =>
    note({
      kind: 'checklist',
      items: [
        { id: 'a', text: '牛乳', checked: false },
        { id: 'b', text: '卵', checked: false },
        { id: 'c', text: '', checked: false },
      ],
    });

  it('全項目にチェックで完了（空行は数えない）', () => {
    const n = list();
    assert.equal(isChecklistDone(n), false);
    const items = toggleItem(toggleItem(n.items, 'a'), 'b');
    assert.equal(isChecklistDone({ ...n, items }), true);
  });

  it('並べ替えは端で止まる', () => {
    const { items } = list();
    assert.deepEqual(moveItem(items, 'a', -1), items);
    assert.deepEqual(moveItem(items, 'a', 1).map((i) => i.id), ['b', 'a', 'c']);
  });

  it('チェック済みを下へ', () => {
    const items = toggleItem(list().items, 'a');
    assert.deepEqual(sinkChecked(items).map((i) => i.id), ['b', 'c', 'a']);
  });

  it('テキスト⇔チェックリスト変換（行単位）', () => {
    const text = note({ body: '牛乳\n\n 卵 \nパン' });
    const toList = convertKind(text, 'checklist', id);
    assert.deepEqual(toList.items.map((i) => i.text), ['牛乳', '卵', 'パン']);
    const back = convertKind({ ...text, ...toList }, 'text', id);
    assert.equal(back.body, '牛乳\n卵\nパン');
  });

  it('新規チェックリストは空の1行から始まり、空判定される', () => {
    const n = createNote('checklist', 'mint', 0, id);
    assert.equal(n.items.length, 1);
    assert.equal(isEmptyNote(n), true);
  });
});

describe('一覧の絞り込み・並べ替え', () => {
  it('ピン留めは常に先頭、ゴミ箱は除外', () => {
    const a = note({ title: 'A', updatedAt: 3 });
    const b = note({ title: 'B', updatedAt: 1, pinned: true });
    const c = note({ title: 'C', updatedAt: 5, deletedAt: 10 });
    const result = selectVisibleNotes([a, b, c], { search: '', colors: [], sort: 'updated' });
    assert.deepEqual(result.map((n) => n.title), ['B', 'A']);
  });

  it('ロック中の付箋は本文を検索しない', () => {
    const open = note({ title: '買い物', body: '秘密の暗証番号' });
    const locked = note({ title: '銀行', body: '秘密の暗証番号', locked: true });
    const result = selectVisibleNotes([open, locked], { search: '暗証', colors: [], sort: 'updated' });
    assert.deepEqual(result.map((n) => n.title), ['買い物']);
  });

  it('色で絞り込み', () => {
    const y = note({ color: 'lemon' });
    const s = note({ color: 'sky' });
    assert.deepEqual(selectVisibleNotes([y, s], { search: '', colors: ['sky'], sort: 'color' }), [s]);
  });
});

describe('ゴミ箱', () => {
  it('30日を過ぎたものだけ自動削除対象', () => {
    const now = 100 * TRASH_RETENTION_MS;
    const old = note({ deletedAt: now - TRASH_RETENTION_MS - 1 });
    const recent = note({ deletedAt: now - 1000 });
    const live = note();
    assert.deepEqual(expiredTrash([old, recent, live], now), [old]);
    assert.deepEqual(selectTrash([old, recent, live]), [recent, old]);
  });
});

describe('ウィジェットのスロット', () => {
  it('1スロットに1枚。割り当てると前の付箋は外れる', () => {
    const a = note({ widgetSlot: 1 });
    const b = note();
    const next = assignWidgetSlot([a, b], b.id, 1, 2000);
    assert.equal(next.find((n) => n.id === a.id)?.widgetSlot, null);
    assert.equal(next.find((n) => n.id === b.id)?.widgetSlot, 1);
  });

  it('同じスロットを再指定しても変更扱いにしない', () => {
    const a = note({ widgetSlot: 2 });
    const [same] = assignWidgetSlot([a], a.id, 2, 2000);
    assert.equal(same, a);
  });
});

describe('リマインダー', () => {
  it('過去のリマインダーだけ外す（updatedAt は変えない）', () => {
    const past = note({ reminderAt: 100, notificationId: 'x' });
    const future = note({ reminderAt: 10_000 });
    const [cleared] = clearPastReminders([past, future], 5000);
    assert.equal(cleared.id, past.id);
    assert.equal(cleared.reminderAt, null);
    assert.equal(cleared.notificationId, null);
    assert.equal(cleared.updatedAt, past.updatedAt);
    assert.equal(clearPastReminders([future], 5000).length, 0);
  });
});
