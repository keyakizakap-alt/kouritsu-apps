import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

export type IconName = string;

// Web プレビュー専用：SF Symbols は Web で描画できないため近い形のアイコンで代用する
const MAP: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  'square.and.pencil': 'create-outline',
  checklist: 'list-outline',
  'checkmark.square.fill': 'checkbox',
  square: 'square-outline',
  pin: 'pin-outline',
  'pin.fill': 'pin',
  'pin.slash': 'pin-outline',
  alarm: 'alarm-outline',
  'alarm.fill': 'alarm',
  'lock.fill': 'lock-closed',
  'lock.open': 'lock-open-outline',
  lock: 'lock-closed-outline',
  trash: 'trash-outline',
  paintpalette: 'color-palette-outline',
  'square.grid.2x2': 'grid-outline',
  'square.grid.2x2.fill': 'grid',
  'list.bullet': 'list',
  magnifyingglass: 'search',
  gearshape: 'settings-outline',
  'ellipsis.circle': 'ellipsis-horizontal-circle-outline',
  'line.3.horizontal.decrease.circle': 'funnel-outline',
  'arrow.uturn.backward': 'arrow-undo-outline',
  'chevron.up': 'chevron-up',
  'chevron.down': 'chevron-down',
  'chevron.right': 'chevron-forward',
  xmark: 'close',
  'xmark.circle.fill': 'close-circle',
  'plus.circle': 'add-circle-outline',
  plus: 'add',
  'widget.small': 'apps-outline',
  faceid: 'scan-outline',
  'bell.slash': 'notifications-off-outline',
  'eye.slash': 'eye-off-outline',
  photo: 'image-outline',
  checkmark: 'checkmark',
  'checkmark.circle.fill': 'checkmark-circle',
  'arrow.down.to.line': 'arrow-down',
  'arrow.counterclockwise': 'refresh',
  'info.circle': 'information-circle-outline',
  'lock.shield': 'shield-checkmark-outline',
  'doc.text': 'document-text-outline',
  'note.text': 'document-text-outline',
  'note.text.badge.plus': 'add-circle-outline',
  'arrow.up.arrow.down': 'swap-vertical',
  'rectangle.stack': 'albums-outline',
  'textformat.size': 'text-outline',
  'exclamationmark.triangle': 'warning-outline',
  'line.3.horizontal.decrease.circle.fill': 'funnel',
};

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: ColorValue; weight?: string }) {
  return <Ionicons name={MAP[name] ?? 'ellipse-outline'} size={size} color={color as string} />;
}
