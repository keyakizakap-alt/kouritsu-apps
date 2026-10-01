'use no memo';
import React from 'react';
import type { WidgetInfo, WidgetTaskHandlerProps } from 'react-native-android-widget';

import { toggleItem, touch } from '../../domain/notes';
import { buildWidgetProps } from '../../domain/widgetSnapshot';
import { getKV, loadNotes, saveNotes, setKV } from '../../storage/db';
import { StickyWidgetAndroid } from './StickyWidgetAndroid';

export const ANDROID_WIDGET_NAME = 'StickyWidget';

const slotKey = (widgetId: number) => `android-widget-slot:${widgetId}`;

async function slotFor(widgetId: number): Promise<number> {
  const value = Number(await getKV(slotKey(widgetId)));
  return value >= 1 && value <= 4 ? value : 1;
}

export async function renderAndroidWidget(info: WidgetInfo): Promise<React.JSX.Element> {
  const [notes, slot] = await Promise.all([loadNotes(), slotFor(info.widgetId)]);
  const props = buildWidgetProps(notes, Date.now());
  return <StickyWidgetAndroid note={props.slots[slot - 1]} slot={slot} width={info.width} height={info.height} />;
}

/**
 * ホーム画面ウィジェットのイベント（追加・更新・リサイズ・タップ）を処理する。
 * アプリが閉じていてもヘッドレス JS として起動し、端末内 DB を直接読み書きする。
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo } = props;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(await renderAndroidWidget(widgetInfo));
      break;

    case 'WIDGET_CLICK': {
      if (props.clickAction === 'TOGGLE') {
        const { noteId, itemId } = (props.clickActionData ?? {}) as { noteId?: string; itemId?: string };
        const notes = await loadNotes();
        const note = notes.find((n) => n.id === noteId);
        if (note && itemId && !note.locked) {
          await saveNotes([touch(note, { items: toggleItem(note.items, itemId) }, Date.now())]);
        }
      } else if (props.clickAction === 'NEXT_SLOT') {
        const current = await slotFor(widgetInfo.widgetId);
        await setKV(slotKey(widgetInfo.widgetId), String((current % 4) + 1));
      }
      props.renderWidget(await renderAndroidWidget(widgetInfo));
      break;
    }

    case 'WIDGET_DELETED':
    default:
      break;
  }
}
