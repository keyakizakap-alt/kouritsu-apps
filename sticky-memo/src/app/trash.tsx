import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../components/controls';
import { ui } from '../components/theme';
import { displayTitle, selectTrash, TRASH_RETENTION_MS } from '../domain/notes';
import { stickyColor } from '../domain/palette';
import { useStore } from '../state/store';

export default function TrashScreen() {
  const insets = useSafeAreaInsets();
  const { notes, restore, purge } = useStore();
  const trash = useMemo(() => selectTrash(notes), [notes]);
  const [now] = useState(() => Date.now());

  const confirmPurge = (ids: string[], label: string) => {
    Alert.alert(`${label}を完全に削除しますか？`, 'この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '完全に削除', style: 'destructive', onPress: () => void purge(ids) },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="戻る" onPress={() => router.back()} />
        <Text style={styles.title}>ゴミ箱</Text>
        {trash.length ? (
          <Pressable onPress={() => confirmPurge(trash.map((n) => n.id), `${trash.length}枚の付箋`)} hitSlop={8}>
            <Text style={styles.emptyAll}>空にする</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {trash.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trash-outline" size={40} color={ui.faint} />
            <Text style={styles.emptyText}>ゴミ箱は空です</Text>
          </View>
        ) : (
          trash.map((note) => {
            const c = stickyColor(note.color);
            const daysLeft = Math.max(0, Math.ceil(((note.deletedAt ?? 0) + TRASH_RETENTION_MS - now) / 86400000));
            return (
              <View key={note.id} style={[styles.item, { backgroundColor: c.paper }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: c.ink }]} numberOfLines={1}>
                    {note.locked ? `🔒 ${note.title || 'ロックされた付箋'}` : displayTitle(note) || '（空の付箋）'}
                  </Text>
                  <Text style={[styles.itemMeta, { color: c.subInk }]}>あと {daysLeft} 日で完全削除</Text>
                </View>
                <IconButton icon="arrow-undo-outline" label="元に戻す" color={c.ink} onPress={() => restore(note.id)} />
                <IconButton icon="close-circle-outline" label="完全に削除" color={c.ink} onPress={() => confirmPurge([note.id], 'この付箋')} />
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2EFE9' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52 },
  title: { fontSize: 17, fontWeight: '700', color: ui.ink },
  emptyAll: { color: ui.danger, fontWeight: '700', fontSize: 15, paddingHorizontal: 8 },
  content: { paddingHorizontal: 16, gap: 10, paddingTop: 8 },
  empty: { alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyText: { color: ui.subInk, fontSize: 15 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 16, paddingVertical: 8, boxShadow: ui.shadow.soft },
  itemTitle: { fontSize: 15.5, fontWeight: '700' },
  itemMeta: { fontSize: 12, marginTop: 3 },
});
