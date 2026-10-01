import { forwardRef } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { checklistProgress, displayTitle, isChecklistDone } from '../domain/notes';
import { stickyColor } from '../domain/palette';
import type { Note } from '../domain/types';
import { Icon } from './Icon';
import { formatReminder, radius, tiltFor, type, useTheme } from './theme';

type Props = {
  note: Note;
  variant: 'board' | 'list';
  onPress?: (e: GestureResponderEvent) => void;
  onToggleItem?: (itemId: string) => void;
};

const BOARD_MAX_ITEMS = 6;
const LIST_MAX_ITEMS = 3;

/** ボード・リストに並ぶ付箋。Link.Trigger asChild から onPress / ref を受け取る */
export const StickyCard = forwardRef<View, Props>(function StickyCard({ note, variant, onPress, onToggleItem, ...rest }, ref) {
  const theme = useTheme();
  const c = theme.paper(note.color);
  const title = displayTitle(note);
  const done = isChecklistDone(note);
  const { done: doneCount, total } = checklistProgress(note);
  const board = variant === 'board';
  const filled = note.items.filter((i) => i.text.trim() !== '');
  const maxItems = board ? BOARD_MAX_ITEMS : LIST_MAX_ITEMS;
  // 「コントラストを上げる」では傾けない（文字の可読性を優先）
  const tilt = board && !theme.a11y.increaseContrast ? tiltFor(note.id) : 0;

  const a11yLabel = note.locked
    ? `ロックされた付箋${note.title ? `、${note.title}` : ''}`
    : [
        `${stickyColor(note.color).label}の付箋`,
        title || '空の付箋',
        note.kind === 'checklist' && total > 0 ? `${total}項目中${doneCount}項目完了` : null,
        note.reminderAt ? `リマインダー ${formatReminder(note.reminderAt)}` : null,
        note.pinned ? 'ピン留め' : null,
        note.widgetSlot ? `ウィジェット スロット${note.widgetSlot}` : null,
      ]
        .filter(Boolean)
        .join('、');

  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="開いて編集します。長押しでメニューを表示します"
      style={({ pressed }) => [
        styles.card,
        board ? styles.boardCard : styles.listCard,
        {
          backgroundColor: c.paper,
          boxShadow: theme.shadow.card,
          borderColor: theme.scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'transparent',
          transform: [{ rotate: `${tilt}deg` }, { scale: pressed && !theme.a11y.reduceMotion ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.band, { backgroundColor: c.band }]} />

      {note.pinned || note.widgetSlot || note.reminderAt || (note.kind === 'checklist' && total > 0 && !note.locked) ? (
        <View style={styles.metaRow} importantForAccessibility="no-hide-descendants">
          {note.pinned ? <Icon name="pin.fill" size={13} color={c.subInk} /> : null}
          {note.widgetSlot ? (
            <View style={[styles.badge, { borderColor: c.subInk }]}>
              <Icon name="widget.small" size={11} color={c.subInk} />
              <Text style={[styles.badgeText, { color: c.subInk }]}>{note.widgetSlot}</Text>
            </View>
          ) : null}
          {note.reminderAt ? (
            <View style={styles.inlineMeta}>
              <Icon name="alarm" size={13} color={c.subInk} />
              <Text style={[type.footnote, styles.metaText, { color: c.subInk }]}>
                {formatReminder(note.reminderAt)}
              </Text>
            </View>
          ) : null}
          {note.kind === 'checklist' && total > 0 && !note.locked ? (
            <Text style={[type.footnote, styles.metaText, { color: c.subInk, marginLeft: 'auto' }]}>
              {doneCount}/{total}
            </Text>
          ) : null}
        </View>
      ) : null}

      {note.locked ? (
        <View style={styles.lockedBody}>
          <Icon name="lock.fill" size={22} color={c.subInk} />
          <Text style={[type.callout, { color: c.ink, fontWeight: theme.weight('600') }]} numberOfLines={2}>
            {note.title || 'ロックされた付箋'}
          </Text>
        </View>
      ) : (
        <>
          <Text
            style={[
              type.callout,
              { color: title ? c.ink : c.subInk, fontWeight: theme.weight('600') },
              done && { textDecorationLine: 'line-through', color: c.subInk },
            ]}
            numberOfLines={board ? 3 : 2}
          >
            {title || '空の付箋'}
          </Text>

          {note.kind === 'text' ? (
            note.title.trim() && note.body.trim() ? (
              <Text style={[type.subheadline, styles.body, { color: c.ink, fontWeight: theme.weight('400') }]} numberOfLines={board ? 8 : 2}>
                {note.body}
              </Text>
            ) : null
          ) : (
            <View style={styles.items}>
              {filled.slice(0, maxItems).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={onToggleItem ? () => onToggleItem(item.id) : undefined}
                  disabled={!onToggleItem}
                  // 行の高さ 34pt ＋上下の hitSlop で 44pt のタップ領域を確保
                  hitSlop={{ top: 5, bottom: 5 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  accessibilityLabel={item.text}
                  style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.6 }]}
                >
                  <Icon name={item.checked ? 'checkmark.square.fill' : 'square'} size={20} color={item.checked ? c.subInk : c.ink} />
                  <Text
                    numberOfLines={2}
                    style={[
                      type.subheadline,
                      styles.itemText,
                      { color: c.ink, fontWeight: theme.weight('400') },
                      item.checked && { textDecorationLine: 'line-through', color: c.subInk },
                    ]}
                  >
                    {item.text}
                  </Text>
                </Pressable>
              ))}
              {filled.length > maxItems ? (
                <Text style={[type.footnote, styles.more, { color: c.subInk }]}>ほか {filled.length - maxItems} 件</Text>
              ) : null}
            </View>
          )}
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 6,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  boardCard: { minHeight: 120 },
  listCard: { borderRadius: radius.md, borderBottomRightRadius: radius.md },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, minHeight: 18, marginBottom: 6 },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderRadius: 6, paddingHorizontal: 4, minHeight: 18 },
  badgeText: { ...type.caption1, fontWeight: '700' },
  body: { marginTop: 6 },
  items: { marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  itemText: { flex: 1 },
  more: { marginTop: 2, fontWeight: '600' },
  lockedBody: { gap: 8, paddingVertical: 6 },
});
