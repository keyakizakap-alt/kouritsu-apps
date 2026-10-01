// ColorNote と同じく「テキスト」「チェックリスト」の2形式
export type NoteKind = 'text' | 'checklist';

export type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type Note = {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  items: ChecklistItem[];
  color: StickyColorId;
  /** 一覧の先頭に固定 */
  pinned: boolean;
  /** 個別ロック（ColorNote のパスワードロック相当）。ウィジェットには中身を出さない */
  locked: boolean;
  /** ウィジェットのスロット番号（1〜4）。null はウィジェットに出さない */
  widgetSlot: WidgetSlot | null;
  /** リマインダー（Stibo のアラーム相当）。epoch ms */
  reminderAt: number | null;
  notificationId: string | null;
  /** ゴミ箱に入れた日時。null は通常 */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type WidgetSlot = 1 | 2 | 3 | 4;
export const WIDGET_SLOTS: WidgetSlot[] = [1, 2, 3, 4];

export type StickyColorId =
  | 'lemon'
  | 'peach'
  | 'coral'
  | 'rose'
  | 'lavender'
  | 'sky'
  | 'aqua'
  | 'mint'
  | 'lime'
  | 'sand'
  | 'cloud'
  | 'graphite';

export type SortMode = 'updated' | 'created' | 'color' | 'title' | 'reminder';
export type ViewMode = 'board' | 'list';

export type BackgroundSetting =
  | { type: 'preset'; id: BackgroundPresetId }
  | { type: 'photo'; uri: string; dim: number };

export type BackgroundPresetId = 'cork' | 'linen' | 'paper' | 'slate' | 'dusk' | 'meadow';

export type AutoLockDelay = 0 | 60 | 300 | 900;

export type Settings = {
  background: BackgroundSetting;
  sortMode: SortMode;
  viewMode: ViewMode;
  /** アプリ起動時に生体認証/端末パスコードを要求 */
  appLock: boolean;
  /** バックグラウンド移行後、何秒でロックするか */
  autoLockDelay: AutoLockDelay;
  /** 通知のプレビューに本文を出さない */
  hideNotificationContent: boolean;
  /** スクリーンショット・画面収録・アプリ切替画面のプレビューを防ぐ */
  preventScreenCapture: boolean;
  defaultColor: StickyColorId;
};

export const DEFAULT_SETTINGS: Settings = {
  background: { type: 'preset', id: 'cork' },
  sortMode: 'updated',
  viewMode: 'board',
  appLock: false,
  autoLockDelay: 0,
  hideNotificationContent: true,
  preventScreenCapture: false,
  defaultColor: 'lemon',
};
