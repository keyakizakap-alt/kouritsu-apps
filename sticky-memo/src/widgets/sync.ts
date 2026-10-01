import { addUserInteractionListener } from 'expo-widgets';
import { Platform } from 'react-native';
import { requestPinWidget, requestWidgetUpdate } from 'react-native-android-widget';

import type { Note } from '../domain/types';
import { buildWidgetProps, mergeWidgetEdits } from '../domain/widgetSnapshot';
import { ANDROID_WIDGET_NAME, renderAndroidWidget } from './android/widgetTaskHandler';
import StickyWidget from './ios/StickyWidget';

/** アプリ側の変更をホーム画面ウィジェットへ反映する */
export async function pushWidgets(notes: Note[]): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      StickyWidget.updateSnapshot(buildWidgetProps(notes, Date.now()));
    } else if (Platform.OS === 'android') {
      await requestWidgetUpdate({ widgetName: ANDROID_WIDGET_NAME, renderWidget: renderAndroidWidget });
    }
  } catch (error) {
    // ウィジェット未設置・開発ビルド外などで失敗しても、アプリ本体の保存は止めない
    console.warn('[widgets] push failed', error);
  }
}

/**
 * iOS: ウィジェット上で付けたチェックをアプリの DB へ取り込む。
 * （Android はウィジェットのタップ時に DB を直接更新するため不要）
 */
export async function pullWidgetEdits(notes: Note[]): Promise<Note[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const timeline = await StickyWidget.getTimeline();
    const latest = timeline.reduce<(typeof timeline)[number] | null>(
      (acc, entry) => (!acc || entry.date.getTime() >= acc.date.getTime() ? entry : acc),
      null,
    );
    return mergeWidgetEdits(notes, latest?.props, Date.now());
  } catch (error) {
    console.warn('[widgets] pull failed', error);
    return [];
  }
}

export function onWidgetInteraction(listener: () => void): () => void {
  if (Platform.OS !== 'ios') return () => {};
  const subscription = addUserInteractionListener((event) => {
    if (event.source === 'StickyWidget') listener();
  });
  return () => subscription.remove();
}

/** Android 8+ のランチャーにウィジェット追加ダイアログを出す（iOS はアプリから追加できない） */
export async function requestAddWidget(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await requestPinWidget({ widgetName: ANDROID_WIDGET_NAME });
  } catch {
    return false;
  }
}
