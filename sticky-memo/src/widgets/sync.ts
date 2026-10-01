import { addUserInteractionListener } from 'expo-widgets';

import type { Note } from '../domain/types';
import { buildWidgetProps, mergeWidgetEdits } from '../domain/widgetSnapshot';
import StickyWidget from './ios/StickyWidget';

/** アプリ側の変更をホーム画面・ロック画面のウィジェットへ反映する */
export async function pushWidgets(notes: Note[]): Promise<void> {
  try {
    StickyWidget.updateSnapshot(buildWidgetProps(notes, Date.now()));
  } catch (error) {
    // ウィジェット未設置・開発ビルド外などで失敗しても、アプリ本体の保存は止めない
    console.warn('[widgets] push failed', error);
  }
}

/** ウィジェット上で付けたチェックをアプリの DB へ取り込む */
export async function pullWidgetEdits(notes: Note[]): Promise<Note[]> {
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
  const subscription = addUserInteractionListener((event) => {
    if (event.source === 'StickyWidget') listener();
  });
  return () => subscription.remove();
}
