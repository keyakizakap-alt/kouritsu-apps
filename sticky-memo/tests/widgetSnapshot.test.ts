import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNote } from '../src/domain/notes';
import type { Note } from '../src/domain/types';
import {
  buildWidgetProps,
  mergeWidgetEdits,
  toggleInWidgetProps,
  WIDGET_MAX_ITEMS,
} from '../src/domain/widgetSnapshot';
import { noteToParams, parseSettings, rowToNote, type NoteRow } from '../src/storage/rows';

let seq = 0;
const id = () => `w${++seq}`;

function checklist(patch: Partial<Note> = {}): Note {
  return {
    ...createNote('checklist', 'sky', 1000, id),
    title: '買い物',
    items: [
      { id: 'i1', text: '牛乳', checked: false },
      { id: 'i2', text: '卵', checked: true },
    ],
    widgetSlot: 1,
    ...patch,
  };
}

describe('ウィジェットへ渡すデータ', () => {
  it('ロック中の付箋は中身を一切含めない', () => {
    const secret = checklist({ locked: true, title: '口座', body: '' });
    const { slots } = buildWidgetProps([secret], 0);
    assert.equal(slots[0]?.locked, true);
    assert.equal(slots[0]?.title, '');
    assert.deepEqual(slots[0]?.items, []);
    assert.ok(!JSON.stringify(slots).includes('牛乳'));
  });

  it('スロット順に並び、空きは null、ゴミ箱の付箋は出さない', () => {
    const a = checklist({ widgetSlot: 3 });
    const trashed = checklist({ widgetSlot: 1, deletedAt: 5 });
    const { slots } = buildWidgetProps([a, trashed], 0);
    assert.deepEqual(slots.map((s) => s?.id ?? null), [null, null, a.id, null]);
  });

  it('項目数の上限を超えた分は件数だけ持つ', () => {
    const many = checklist({
      items: Array.from({ length: WIDGET_MAX_ITEMS + 3 }, (_, i) => ({ id: `x${i}`, text: `項目${i}`, checked: i >= WIDGET_MAX_ITEMS + 1 })),
    });
    const wn = buildWidgetProps([many], 0).slots[0]!;
    assert.equal(wn.items.length, WIDGET_MAX_ITEMS);
    assert.equal(wn.extraTotal, 3);
    assert.equal(wn.extraDone, 2);
    assert.equal(wn.progress, `2/${WIDGET_MAX_ITEMS + 3}`);
  });
});

describe('ウィジェット上のチェック操作の取り込み', () => {
  it('アプリ側が未編集なら取り込む', () => {
    const n = checklist();
    const props = toggleInWidgetProps(buildWidgetProps([n], 0), n.id, 'i1');
    assert.equal(props.slots[0]?.progress, '2/2');
    assert.equal(props.slots[0]?.done, true);
    const [merged] = mergeWidgetEdits([n], props, 5000);
    assert.equal(merged.items.find((i) => i.id === 'i1')?.checked, true);
    assert.equal(merged.updatedAt, 5000);
  });

  it('送信後にアプリ側で編集されていたらアプリ側を優先', () => {
    const n = checklist();
    const props = toggleInWidgetProps(buildWidgetProps([n], 0), n.id, 'i1');
    const editedInApp = { ...n, updatedAt: n.updatedAt + 1 };
    assert.deepEqual(mergeWidgetEdits([editedInApp], props, 5000), []);
  });

  it('ウィジェットで操作していなければ何もしない', () => {
    const n = checklist();
    assert.deepEqual(mergeWidgetEdits([n], buildWidgetProps([n], 0), 5000), []);
    assert.deepEqual(mergeWidgetEdits([n], null, 5000), []);
  });
});

describe('DB 行の変換', () => {
  it('往復しても同じ', () => {
    const n = checklist({ pinned: true, reminderAt: 99, notificationId: 'n1' });
    const p = noteToParams(n);
    const row: NoteRow = {
      id: p[0] as string,
      kind: p[1] as string,
      title: p[2] as string,
      body: p[3] as string,
      items: p[4] as string,
      color: p[5] as string,
      pinned: p[6] as number,
      locked: p[7] as number,
      widget_slot: p[8] as number | null,
      reminder_at: p[9] as number | null,
      notification_id: p[10] as string | null,
      deleted_at: p[11] as number | null,
      created_at: p[12] as number,
      updated_at: p[13] as number,
    };
    assert.deepEqual(rowToNote(row), n);
  });

  it('壊れた JSON でも落ちない', () => {
    const n = rowToNote({
      id: 'x', kind: 'checklist', title: '', body: '', items: '{oops', color: 'lemon', pinned: 0, locked: 0,
      widget_slot: 9, reminder_at: null, notification_id: null, deleted_at: null, created_at: 0, updated_at: 0,
    });
    assert.deepEqual(n.items, []);
    assert.equal(n.widgetSlot, null);
    assert.equal(parseSettings('not json').sortMode, 'updated');
    assert.equal(parseSettings('{"appLock":true}').appLock, true);
  });
});
