import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { displayTitle } from '../domain/notes';
import type { Note } from '../domain/types';

/**
 * リマインダーは端末内のローカル通知のみ（プッシュ通知・サーバーは使わない）。
 */
const CHANNEL_ID = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '付箋のリマインダー',
    importance: Notifications.AndroidImportance.HIGH,
    // ロック画面では通知の存在のみ表示し、本文は隠す
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function scheduleReminder(note: Note, at: number, hideContent: boolean): Promise<string | null> {
  if (at <= Date.now()) return null;
  if (!(await ensureNotificationPermission())) return null;
  await ensureChannel();
  const concealed = hideContent || note.locked;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: concealed ? '付箋のリマインダー' : displayTitle(note) || '付箋のリマインダー',
      body: concealed ? 'タップして付箋を開く' : note.kind === 'text' ? note.body.slice(0, 120) : note.items.filter((i) => !i.checked).map((i) => `・${i.text}`).slice(0, 4).join('\n'),
      data: { noteId: note.id },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
  });
}

export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // 既に配信済みなど
  }
}

export function onReminderOpened(listener: (noteId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const noteId = response.notification.request.content.data?.noteId;
    if (typeof noteId === 'string') listener(noteId);
  });
  return () => subscription.remove();
}
