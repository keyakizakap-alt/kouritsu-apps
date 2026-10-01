'use no memo';
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetNote } from '../../domain/widgetSnapshot';

type Props = {
  note: WidgetNote | null;
  slot: number;
  width: number;
  height: number;
};

const FALLBACK = { paper: '#FFF3A3', band: '#F6E37A', ink: '#3D3519', subInk: '#7A6C35' };

/**
 * Android ホーム画面の付箋ウィジェット（ColorNote の付箋ウィジェット相当）。
 * フックは使えないため、純粋な関数として描画する。
 */
export function StickyWidgetAndroid({ note, slot, width, height }: Props) {
  const c = note ?? FALLBACK;
  const compact = width < 180;
  const rowHeight = compact ? 22 : 26;
  const maxRows = Math.max(1, Math.floor((height - 52) / rowHeight));

  const header = (
    <FlexWidget
      clickAction="NEXT_SLOT"
      accessibilityLabel="表示するスロットを切り替え"
      style={{
        width: 'match_parent',
        height: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        backgroundColor: c.band as `#${string}`,
      }}
    >
      <TextWidget
        text={!note ? `スロット${slot}` : note.locked ? 'ロック中' : note.title || '付箋'}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 14, fontWeight: 'bold', color: c.ink as `#${string}` }}
      />
      <TextWidget
        text={note?.progress ? `${note.progress}  ⇄${slot}` : `⇄${slot}`}
        style={{ fontSize: 11, color: c.subInk as `#${string}` }}
      />
    </FlexWidget>
  );

  let content: React.JSX.Element;
  if (!note) {
    content = (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'stickymemo://' }}
        style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 12 }}
      >
        <TextWidget
          text="アプリで付箋の「ウィジェットに貼る」からこのスロットを選んでください"
          style={{ fontSize: 12, color: c.subInk as `#${string}`, textAlign: 'center' }}
        />
      </FlexWidget>
    );
  } else if (note.locked) {
    content = (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: `stickymemo://note/${note.id}` }}
        style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center' }}
      >
        <TextWidget text="🔒" style={{ fontSize: 26 }} />
      </FlexWidget>
    );
  } else if (note.kind === 'text') {
    content = (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: `stickymemo://note/${note.id}` }}
        style={{ flex: 1, width: 'match_parent', padding: 12 }}
      >
        <TextWidget
          text={note.body}
          maxLines={Math.max(1, Math.floor((height - 54) / 19))}
          truncate="END"
          style={{ fontSize: compact ? 13 : 14, color: c.ink as `#${string}`, lineHeight: 19 }}
        />
      </FlexWidget>
    );
  } else {
    const visible = note.items.slice(0, maxRows - (note.items.length > maxRows ? 1 : 0));
    const rest = note.items.length - visible.length + note.extraTotal;
    content = (
      <FlexWidget style={{ flex: 1, width: 'match_parent', paddingHorizontal: 10, paddingVertical: 6 }}>
        {visible.map((item) => (
          <FlexWidget
            key={item.id}
            clickAction="TOGGLE"
            clickActionData={{ noteId: note.id, itemId: item.id }}
            accessibilityLabel={`${item.text} ${item.checked ? 'チェック済み' : '未チェック'}`}
            style={{ width: 'match_parent', height: rowHeight, flexDirection: 'row', alignItems: 'center' }}
          >
            <TextWidget
              text={item.checked ? '☑' : '☐'}
              style={{ fontSize: compact ? 15 : 17, color: (item.checked ? c.subInk : c.ink) as `#${string}`, marginRight: 6 }}
            />
            <TextWidget
              text={item.text}
              maxLines={1}
              truncate="END"
              style={{ fontSize: compact ? 12 : 14, color: (item.checked ? c.subInk : c.ink) as `#${string}` }}
            />
          </FlexWidget>
        ))}
        {rest > 0 ? (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `stickymemo://note/${note.id}` }}
            style={{ width: 'match_parent', height: rowHeight - 4, justifyContent: 'center' }}
          >
            <TextWidget text={`ほか ${rest} 件 ›`} style={{ fontSize: 11, color: c.subInk as `#${string}` }} />
          </FlexWidget>
        ) : null}
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: c.paper as `#${string}`,
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      {header}
      {content}
    </FlexWidget>
  );
}
