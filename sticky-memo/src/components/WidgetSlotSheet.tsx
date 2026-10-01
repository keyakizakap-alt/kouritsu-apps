import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { displayTitle } from '../domain/notes';
import { stickyColor } from '../domain/palette';
import type { Note, WidgetSlot } from '../domain/types';
import { WIDGET_SLOTS } from '../domain/types';
import { requestAddWidget } from '../widgets/sync';
import { Sheet } from './controls';
import { ui } from './theme';

type Props = {
  visible: boolean;
  note: Note;
  notes: Note[];
  onClose: () => void;
  onSelect: (slot: WidgetSlot | null) => void;
};

export function WidgetSlotSheet({ visible, note, notes, onClose, onSelect }: Props) {
  const occupant = (slot: WidgetSlot) => notes.find((n) => n.deletedAt === null && n.widgetSlot === slot);

  return (
    <Sheet visible={visible} onClose={onClose} title="ウィジェットに貼る">
      <Text style={styles.lead}>
        ホーム画面のウィジェットは「スロット1〜4」のどれかを表示します。この付箋を貼るスロットを選んでください。
      </Text>
      <View style={styles.grid}>
        {WIDGET_SLOTS.map((slot) => {
          const other = occupant(slot);
          const mine = note.widgetSlot === slot;
          const c = other ? stickyColor(other.color) : null;
          return (
            <Pressable
              key={slot}
              onPress={() => onSelect(mine ? null : slot)}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              style={({ pressed }) => [
                styles.slot,
                c && { backgroundColor: c.paper },
                mine && styles.slotMine,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.slotNo}>スロット {slot}</Text>
              <Text style={styles.slotNote} numberOfLines={2}>
                {mine ? 'この付箋（タップで外す）' : other ? (other.locked ? '🔒 ロック中の付箋' : displayTitle(other) || '（空の付箋）') : '空き'}
              </Text>
              {mine ? <Ionicons name="checkmark-circle" size={20} color={ui.ink} style={styles.check} /> : null}
            </Pressable>
          );
        })}
      </View>
      {note.locked ? (
        <Text style={styles.note}>この付箋はロック中のため、ウィジェットには中身を表示せず鍵アイコンのみ表示します。</Text>
      ) : null}

      <View style={styles.help}>
        <Ionicons name="information-circle-outline" size={18} color={ui.subInk} />
        <Text style={styles.helpText}>
          {Platform.OS === 'ios'
            ? 'ホーム画面を長押し →「編集」→「ウィジェットを追加」→「付箋メモ」を選択。追加後にウィジェットを長押し →「ウィジェットを編集」でスロットを選べます。ロック画面にも追加できます。'
            : 'ウィジェットのヘッダー（⇄）をタップすると表示するスロットを切り替えられます。'}
        </Text>
      </View>
      {Platform.OS === 'android' ? (
        <Pressable onPress={() => void requestAddWidget()} style={styles.addButton} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.addText}>ホーム画面にウィジェットを追加</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, lineHeight: 20, color: ui.subInk, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    width: '48%',
    flexGrow: 1,
    minHeight: 86,
    borderRadius: 14,
    padding: 12,
    backgroundColor: ui.surfaceAlt,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotMine: { borderColor: ui.ink },
  slotNo: { fontSize: 12, fontWeight: '800', color: ui.subInk, letterSpacing: 0.5 },
  slotNote: { fontSize: 14, fontWeight: '600', color: ui.ink, marginTop: 6 },
  check: { position: 'absolute', top: 10, right: 10 },
  note: { fontSize: 12.5, color: ui.subInk, marginTop: 12, lineHeight: 18 },
  help: { flexDirection: 'row', gap: 8, marginTop: 16, backgroundColor: ui.surfaceAlt, borderRadius: 12, padding: 12 },
  helpText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: ui.subInk },
  addButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    backgroundColor: ui.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
