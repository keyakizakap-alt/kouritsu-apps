import type { Note } from '../domain/types';

// Web プレビューでは通知を出さず、設定値だけ保持する
export async function ensureNotificationPermission(): Promise<boolean> {
  return true;
}
export async function scheduleReminder(note: Note, at: number, _hideContent: boolean): Promise<string | null> {
  return at > Date.now() ? `web-${note.id}` : null;
}
export async function cancelReminder(_notificationId: string | null): Promise<void> {}
export function onReminderOpened(_listener: (noteId: string) => void): () => void {
  return () => {};
}
