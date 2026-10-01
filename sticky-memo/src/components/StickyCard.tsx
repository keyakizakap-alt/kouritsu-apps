import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { checklistProgress, displayTitle, isChecklistDone } from '../domain/notes';
import { stickyColor } from '../domain/palette';
import type { FontScale, Note } from '../domain/types';
import { fontSizes, formatReminder, tiltFor, ui } from './theme';

type Props = {
  note: Note;
  variant: 'board' | 'list';
  fontScale: FontScale;
  onPress: () => void;
  onToggleItem?: (itemId: string) => void;
};

const BOARD_MAX_ITEMS = 6;

export function StickyCard({ note, variant, fontScale, onPress, onToggleItem }: Props) {
  const c = stickyColor(note.color);
  const f = fontSizes(fontScale);
  const title = displayTitle(note);
  const done = isChecklistDone(note);
  const { done: doneCount, total } = checklistProgress(note);
  const board = variant === 'board';
  const filledItems = note.items.filter((i) => i.text.trim() !== '');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={note.locked ? 'ロックされた付箋' : `付箋 ${title}`}
      style={({ pressed }) => [
        styles.card,
        board ? styles.boardCard : styles.listCard,
        {
          backgroundColor: c.paper,
          transform: board ? [{ rotate: `${tiltFor(note.id)}deg` }, { scale: pressed ? 0.97 : 1 }] : [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      {/* 付箋の糊帯 */}
      <View style={[styles.band, { backgroundColor: c.band }]} />

      <View style={styles.metaRow}>
        {note.pinned ? <Ionicons name="pin" size={13} color={c.subInk} /> : null}
        {note.widgetSlot ? (
          <View style={[styles.badge, { borderColor: c.subInk }]}>
            <Ionicons name="apps" size={9} color={c.subInk} />
            <Text style={[styles.badgeText, { color: c.subInk }]}>{note.widgetSlot}</Text>
          </View>
        ) : null}
        {note.reminderAt ? (
          <View style={styles.inlineMeta}>
            <Ionicons name="alarm-outline" size={12} color={c.subInk} />
            <Text style={[styles.metaText, { color: c.subInk, fontSize: f.meta }]}>{formatReminder(note.reminderAt)}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {note.kind === 'checklist' && total > 0 && !note.locked ? (
          <Text style={[styles.metaText, { color: c.subInk, fontSize: f.meta }]}>
            {doneCount}/{total}
          </Text>
        ) : null}
      </View>

      {note.locked ? (
        <View style={styles.lockedBody}>
          <Ionicons name="lock-closed" size={22} color={c.subInk} />
          {note.title ? (
            <Text style={[styles.title, { color: c.ink, fontSize: f.title }]} numberOfLines={1}>
              {note.title}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          {title ? (
            <Text
              style={[styles.title, { color: c.ink, fontSize: f.title }, done && { textDecorationLine: 'line-through', color: c.subInk }]}
              numberOfLines={2}
            >
              {title}
            </Text>
          ) : (
            <Text style={[styles.title, { color: c.subInk, fontSize: f.title }]}>（空の付箋）</Text>
          )}

          {note.kind === 'text' ? (
            note.title.trim() && note.body.trim() ? (
              <Text style={[styles.body, { color: c.ink, fontSize: f.body }]} numberOfLines={board ? 7 : 2}>
                {note.body}
              </Text>
            ) : null
          ) : (
            <View style={styles.items}>
              {filledItems.slice(0, board ? BOARD_MAX_ITEMS : 3).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={onToggleItem ? () => onToggleItem(item.id) : undefined}
                  hitSlop={4}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  style={styles.itemRow}
                >
                  <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={f.body + 3} color={item.checked ? c.subInk : c.ink} />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.itemText,
                      { color: c.ink, fontSize: f.body },
                      item.checked && { textDecorationLine: 'line-through', color: c.subInk },
                    ]}
                  >
                    {item.text}
                  </Text>
                </Pressable>
              ))}
              {filledItems.length > (board ? BOARD_MAX_ITEMS : 3) ? (
                <Text style={[styles.more, { color: c.subInk, fontSize: f.meta }]}>
                  ほか {filledItems.length - (board ? BOARD_MAX_ITEMS : 3)} 件
                </Text>
              ) : null}
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    borderBottomRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    boxShadow: ui.shadow.card,
    overflow: 'hidden',
  },
  boardCard: { minHeight: 130 },
  listCard: { minHeight: 0, borderRadius: 10, borderBottomRightRadius: 10 },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, opacity: 0.85 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 14, marginBottom: 4 },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metaText: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 9, fontWeight: '700' },
  title: { fontWeight: '700', lineHeight: 22, letterSpacing: 0.2 },
  body: { marginTop: 4, lineHeight: 20 },
  items: { marginTop: 6, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemText: { flex: 1 },
  more: { marginTop: 2, fontWeight: '600' },
  lockedBody: { alignItems: 'flex-start', gap: 6, paddingVertical: 8 },
});
