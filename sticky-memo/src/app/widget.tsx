import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { SheetHeader } from '../components/ios';
import { MIN_TOUCH, radius, type, useTheme } from '../components/theme';
import { displayTitle } from '../domain/notes';
import type { Note, WidgetSlot } from '../domain/types';
import { WIDGET_SLOTS } from '../domain/types';
import { useNote, useStore } from '../state/store';

/** 付箋をウィジェットのスロット1〜4に貼るシート */
export default function WidgetSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const note = useNote(id);
  const { notes, setWidgetSlot } = useStore();
  if (!note) return null;

  const occupant = (slot: WidgetSlot) => notes.find((n) => n.deletedAt === null && n.widgetSlot === slot);
  const select = (slot: WidgetSlot) => {
    void Haptics.selectionAsync();
    setWidgetSlot(note.id, note.widgetSlot === slot ? null : slot);
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 16 }]}>
      <SheetHeader title="ウィジェットに貼る" onClose={() => router.back()} />
      <View style={styles.previewRow}>
        <WidgetPreview note={note} />
        <Text style={[type.subheadline, { color: theme.ui.secondaryLabel, flex: 1 }]}>
          ウィジェットにはメモの中身だけが表示されます。ウィジェットをタップするとこのメモが開きます。
        </Text>
      </View>
      <Text style={[type.subheadline, { color: theme.ui.secondaryLabel, marginBottom: 16 }]}>
        ウィジェットは「スロット1〜4」のどれかを表示します。貼るスロットを選んでください。
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {WIDGET_SLOTS.map((slot) => {
          const other = occupant(slot);
          const mine = note.widgetSlot === slot;
          const tone = other ? theme.paper(other.color) : null;
          const label = mine ? 'この付箋' : other ? (other.locked ? 'ロック中の付箋' : displayTitle(other) || '空の付箋') : '空き';
          return (
            <Pressable
              key={slot}
              onPress={() => select(slot)}
              accessibilityRole="radio"
              accessibilityState={{ selected: mine }}
              accessibilityLabel={`スロット${slot}、${label}`}
              accessibilityHint={mine ? 'タップでスロットから外します' : other ? 'タップで入れ替えます' : undefined}
              style={({ pressed }) => [
                styles.slot,
                { backgroundColor: tone?.paper ?? theme.ui.fill, borderColor: mine ? theme.ui.accent : 'transparent' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={styles.slotHead}>
                <Text style={[type.footnote, { color: tone?.subInk ?? theme.ui.secondaryLabel, fontWeight: '700' }]}>スロット {slot}</Text>
                {mine ? <Icon name="checkmark.circle.fill" size={22} color={theme.ui.accent} /> : null}
              </View>
              <Text style={[type.subheadline, { color: tone?.ink ?? theme.ui.label, fontWeight: '600' }]} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {note.locked ? (
        <Text style={[type.footnote, { color: theme.ui.secondaryLabel, marginTop: 12 }]}>
          ロック中の付箋は、ウィジェットには中身を出さず鍵のアイコンだけを表示します。
        </Text>
      ) : null}
      <View style={[styles.help, { backgroundColor: theme.ui.fill }]}>
        <Icon name="info.circle" size={18} color={theme.ui.secondaryLabel} />
        <Text style={[type.footnote, { color: theme.ui.secondaryLabel, flex: 1 }]}>
          ホーム画面を長押し →「編集」→「ウィジェットを追加」→「付箋メモ」。追加したウィジェットを長押し →「ウィジェットを編集」でスロットを選べます。ロック画面にも追加できます。
        </Text>
      </View>
    </View>
  );
}

/** ホーム画面の小サイズのウィジェットと同じ見た目の見本（メモの中身だけ） */
function WidgetPreview({ note }: { note: Note }) {
  const theme = useTheme();
  const tone = theme.paper(note.color);
  const text = note.body.trim() ? note.body : note.title;
  const items = note.items.filter((i) => i.text.trim() !== '').slice(0, 4);
  return (
    <View
      style={[styles.preview, { backgroundColor: tone.paper, boxShadow: theme.shadow.card }]}
      accessible
      accessibilityLabel="ウィジェットでの見え方"
    >
      {note.locked ? (
        <View style={styles.previewCenter}>
          <Icon name="lock.fill" size={22} color={tone.subInk} />
        </View>
      ) : note.kind === 'text' ? (
        <Text style={[type.footnote, { color: tone.ink, lineHeight: 18 }]} numberOfLines={4}>
          {text.trim() || ' '}
        </Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.previewItem}>
            <Icon name={item.checked ? 'checkmark.square.fill' : 'square'} size={13} color={item.checked ? tone.subInk : tone.ink} />
            <Text
              style={[type.footnote, { color: item.checked ? tone.subInk : tone.ink, flex: 1 }, item.checked && { textDecorationLine: 'line-through' }]}
              numberOfLines={1}
            >
              {item.text}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  preview: { width: 112, height: 112, borderRadius: 22, padding: 12, overflow: 'hidden' },
  previewCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 21 },
  root: { paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { width: '48%', flexGrow: 1, minHeight: 92, borderRadius: radius.lg, padding: 14, borderWidth: 3, gap: 6 },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  help: { flexDirection: 'row', gap: 8, marginTop: 16, borderRadius: radius.md, padding: 12, minHeight: MIN_TOUCH },
});
