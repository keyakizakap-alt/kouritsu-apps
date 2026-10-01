import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../components/Icon';
import { Section } from '../components/ios';
import { MIN_TOUCH, type, useTheme, WEB_HEADER_INSET } from '../components/theme';
import { displayTitle, selectTrash, TRASH_RETENTION_MS } from '../domain/notes';
import type { Note } from '../domain/types';
import { useStore } from '../state/store';

/** iOS は下からのアクションシート、Web プレビューはアラートで選択肢を出す */
function choose(title: string, message: string, options: { label: string; destructive?: boolean; onPress: () => void }[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...options.map((o) => o.label), 'キャンセル'],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options.findIndex((o) => o.destructive),
      },
      (index) => options[index]?.onPress(),
    );
  } else {
    Alert.alert(title, message, [
      ...options.map((o) => ({ text: o.label, style: o.destructive ? ('destructive' as const) : ('default' as const), onPress: o.onPress })),
      { text: 'キャンセル', style: 'cancel' as const },
    ]);
  }
}

export default function TrashScreen() {
  const theme = useTheme();
  const { notes, restore, purge } = useStore();
  const trash = useMemo(() => selectTrash(notes), [notes]);
  const [now] = useState(() => Date.now());

  const daysLeft = (note: Note) => Math.max(0, Math.ceil(((note.deletedAt ?? 0) + TRASH_RETENTION_MS - now) / 86400000));
  const label = (note: Note) => (note.locked ? note.title || 'ロックされた付箋' : displayTitle(note) || '空の付箋');

  const onItem = (note: Note) =>
    choose(label(note), `あと${daysLeft(note)}日で完全に削除されます`, [
      {
        label: '元に戻す',
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          restore(note.id);
        },
      },
      { label: '完全に削除', destructive: true, onPress: () => void purge([note.id]) },
    ]);

  const emptyAll = () =>
    choose('ゴミ箱を空にしますか？', `${trash.length}枚の付箋を完全に削除します。この操作は取り消せません。`, [
      { label: `${trash.length}枚を完全に削除`, destructive: true, onPress: () => void purge(trash.map((n) => n.id)) },
    ]);

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button hidden={trash.length === 0} onPress={emptyAll} accessibilityLabel="ゴミ箱を空にする">
          すべて削除
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        style={{ backgroundColor: theme.ui.groupedBackground }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 48, paddingTop: WEB_HEADER_INSET, flexGrow: 1 }}
      >
        {trash.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="trash" size={44} color={theme.ui.secondaryLabel} />
            <Text style={[type.title3, { color: theme.ui.label }]}>ゴミ箱は空です</Text>
            <Text style={[type.subheadline, { color: theme.ui.secondaryLabel, textAlign: 'center' }]}>
              削除した付箋は30日間ここに残り、元に戻せます。
            </Text>
          </View>
        ) : (
          <Section footer="タップすると「元に戻す」「完全に削除」を選べます。30日を過ぎた付箋は自動で完全に削除されます。">
            {trash.map((note, i) => {
              const tone = theme.paper(note.color);
              const last = i === trash.length - 1;
              return (
                <Pressable
                  key={note.id}
                  onPress={() => onItem(note)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label(note)}、あと${daysLeft(note)}日で完全に削除`}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.ui.fill }]}
                >
                  <View style={[styles.swatch, { backgroundColor: tone.paper, borderColor: theme.ui.separator }]}>
                    {note.locked ? <Icon name="lock.fill" size={13} color={tone.subInk} /> : null}
                  </View>
                  <View style={[styles.rowBody, !last && { borderBottomColor: theme.ui.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[type.body, { color: theme.ui.label }]} numberOfLines={1}>
                      {label(note)}
                    </Text>
                    <Text style={[type.footnote, { color: theme.ui.secondaryLabel }]}>あと {daysLeft(note)} 日</Text>
                  </View>
                </Pressable>
              );
            })}
          </Section>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, paddingTop: 120 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, minHeight: MIN_TOUCH + 16 },
  swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowBody: { flex: 1, paddingVertical: 10, paddingRight: 16, gap: 2 },
});
