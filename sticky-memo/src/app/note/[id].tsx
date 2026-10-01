import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '../../components/Icon';
import { formatDateTime, formatReminder, MIN_TOUCH, type, useTheme } from '../../components/theme';
import { convertKind, isChecklistDone, moveItem, sinkChecked, toggleItem, uncheckAll } from '../../domain/notes';
import type { ChecklistItem } from '../../domain/types';
import { authAvailability } from '../../security/auth';
import { useNote, useStore } from '../../state/store';

type Draft = { title: string; body: string; items: ChecklistItem[] };
const COMMIT_DELAY = 400;

export default function NoteEditor() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const theme = useTheme();
  const note = useNote(id);
  const { updateNote, discardIfEmpty, moveToTrash, isNoteUnlocked, unlockNote, keepUnlocked } = useStore();

  const [draft, setDraft] = useState<Draft | null>(note ? { title: note.title, body: note.body, items: note.items } : null);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Draft | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current && id) {
      updateNote(id, pending.current);
      pending.current = null;
    }
  }, [id, updateNote]);

  const edit = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, COMMIT_DELAY);
      return next;
    });
  };

  // 画面を閉じるときに未保存分を書き込み、空の新規付箋は破棄
  useEffect(() => {
    return () => {
      flush();
      if (id) discardIfEmpty(id);
    };
  }, [flush, discardIfEmpty, id]);

  // チェックリストへの変換などでストア側の items が変わった場合に追従
  useEffect(() => {
    if (note && !pending.current) setDraft({ title: note.title, body: note.body, items: note.items });
  }, [note?.kind, note?.items]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note || !draft) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.ui.groupedBackground }]}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={[type.body, { color: theme.ui.secondaryLabel }]}>この付箋は見つかりませんでした</Text>
      </View>
    );
  }

  const c = theme.paper(note.color);
  const unlocked = isNoteUnlocked(note.id);
  const done = isChecklistDone({ ...note, items: draft.items });
  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerStyle: { backgroundColor: c.paper },
        headerTintColor: c.ink,
        headerShadowVisible: false,
        headerTransparent: false,
        contentStyle: { backgroundColor: c.paper },
      }}
    />
  );
  const barStyle = note.color === 'graphite' || theme.scheme === 'dark' ? 'light' : 'dark';

  const addItemAfter = (afterId: string | null) => {
    const item = { id: Crypto.randomUUID(), text: '', checked: false };
    const items = draft.items.slice();
    const index = afterId ? items.findIndex((i) => i.id === afterId) + 1 : items.length;
    items.splice(index, 0, item);
    edit({ items });
    setFocusItemId(item.id);
  };

  const removeItem = (itemId: string) => {
    const items = draft.items.filter((i) => i.id !== itemId);
    edit({ items: items.length ? items : [{ id: Crypto.randomUUID(), text: '', checked: false }] });
  };

  const toggleLock = async () => {
    if (note.locked) {
      if (await unlockNote(note.id)) updateNote(note.id, { locked: false });
      return;
    }
    if ((await authAvailability()) === 'none') {
      Alert.alert('ロックを使えません', '「設定」アプリで Face ID またはパスコードを設定してください。');
      return;
    }
    flush();
    // ロックした本人はこのセッション中は引き続き閲覧できるよう解除状態にしておく
    keepUnlocked(note.id);
    updateNote(note.id, { locked: true });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ゴミ箱は30日間元に戻せるため、確認ダイアログは出さない（iOS の「メモ」と同じ）
  const trash = async () => {
    flush();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await moveToTrash(note.id);
    router.back();
  };

  const changeKind = () => {
    flush();
    const next = convertKind({ ...note, ...draft }, note.kind === 'text' ? 'checklist' : 'text', () => Crypto.randomUUID());
    setDraft({ title: draft.title, body: next.body, items: next.items });
    updateNote(note.id, { title: draft.title, ...next });
  };

  const openSheet = (pathname: '/color' | '/reminder' | '/widget') => {
    flush();
    router.push({ pathname, params: { id: note.id } });
  };

  if (note.locked && !unlocked) {
    return (
      <View style={[styles.lockedWrap, { backgroundColor: c.paper }]}>
        {header}
        <StatusBar style={barStyle} />
        <Icon name="lock.fill" size={44} color={c.subInk} />
        <Text style={[type.title2, { color: c.ink, textAlign: 'center' }]}>{note.title || 'ロックされた付箋'}</Text>
        <Text style={[type.subheadline, { color: c.subInk, textAlign: 'center' }]}>Face ID または iPhone のパスコードで開けます</Text>
        <Pressable
          onPress={() => void unlockNote(note.id)}
          style={({ pressed }) => [styles.unlockButton, { backgroundColor: c.ink }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Icon name="faceid" size={20} color={c.paper} />
          <Text style={[type.headline, { color: c.paper }]}>ロックを解除</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      {header}
      <StatusBar style={barStyle} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={note.pinned ? 'pin.fill' : 'pin'}
          selected={note.pinned}
          accessibilityLabel={note.pinned ? 'ピン留めを外す' : 'ピン留め'}
          onPress={() => {
            void Haptics.selectionAsync();
            updateNote(note.id, { pinned: !note.pinned });
          }}
        />
        <Stack.Toolbar.Menu icon="ellipsis.circle" accessibilityLabel="その他の操作">
          <Stack.Toolbar.MenuAction icon={note.kind === 'text' ? 'checklist' : 'doc.text'} onPress={changeKind}>
            {note.kind === 'text' ? 'チェックリストに変換' : 'テキストに変換'}
          </Stack.Toolbar.MenuAction>
          {note.kind === 'checklist' ? (
            <Stack.Toolbar.Menu inline title="チェックリスト">
              <Stack.Toolbar.MenuAction icon="arrow.down.to.line" onPress={() => edit({ items: sinkChecked(draft.items) })}>
                チェック済みを下へ
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="arrow.counterclockwise" onPress={() => edit({ items: uncheckAll(draft.items) })}>
                すべてのチェックを外す
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          ) : null}
          <Stack.Toolbar.MenuAction icon="trash" destructive onPress={() => void trash()}>
            ゴミ箱に移動
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Stack.Toolbar>
        <Stack.Toolbar.Button icon="paintpalette" accessibilityLabel="色" onPress={() => openSheet('/color')} />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button
          icon={note.reminderAt ? 'alarm.fill' : 'alarm'}
          accessibilityLabel="リマインダー"
          onPress={() => openSheet('/reminder')}
        />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button icon="widget.small" selected={!!note.widgetSlot} accessibilityLabel="ウィジェットに貼る" onPress={() => openSheet('/widget')} />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button
          icon={note.locked ? 'lock.fill' : 'lock.open'}
          selected={note.locked}
          accessibilityLabel={note.locked ? 'ロックを解除' : 'この付箋をロック'}
          onPress={() => void toggleLock()}
        />
      </Stack.Toolbar>

      <ScrollView
        style={{ flex: 1, backgroundColor: c.paper }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
      >
        <TextInput
          value={draft.title}
          onChangeText={(title) => edit({ title })}
          placeholder="タイトル"
          placeholderTextColor={c.subInk}
          style={[type.title2, styles.titleInput, { color: c.ink, fontWeight: theme.weight('700') }, done && { textDecorationLine: 'line-through' }]}
          returnKeyType="next"
          maxLength={120}
          accessibilityLabel="タイトル"
        />
        <Text style={[type.footnote, { color: c.subInk, marginTop: 2 }]}>{formatDateTime(note.updatedAt)} に更新</Text>

        {note.reminderAt || note.widgetSlot ? (
          <View style={styles.tags}>
            {note.reminderAt ? (
              <Pressable
                onPress={() => openSheet('/reminder')}
                style={({ pressed }) => [styles.tag, { borderColor: c.subInk }, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`リマインダー ${formatReminder(note.reminderAt)}`}
              >
                <Icon name="alarm" size={15} color={c.subInk} />
                <Text style={[type.footnote, { color: c.subInk, fontWeight: '600' }]}>{formatReminder(note.reminderAt)}</Text>
              </Pressable>
            ) : null}
            {note.widgetSlot ? (
              <Pressable
                onPress={() => openSheet('/widget')}
                style={({ pressed }) => [styles.tag, { borderColor: c.subInk }, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                <Icon name="widget.small" size={15} color={c.subInk} />
                <Text style={[type.footnote, { color: c.subInk, fontWeight: '600' }]}>ウィジェット スロット{note.widgetSlot}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {note.kind === 'text' ? (
          <TextInput
            value={draft.body}
            onChangeText={(body) => edit({ body })}
            placeholder="メモを入力"
            placeholderTextColor={c.subInk}
            multiline
            scrollEnabled={false}
            autoFocus={isNew === '1'}
            textAlignVertical="top"
            style={[type.body, styles.bodyInput, { color: c.ink, fontWeight: theme.weight('400') }]}
            accessibilityLabel="本文"
          />
        ) : (
          <View style={styles.items}>
            {draft.items.map((item, index) => {
              const editing = editingItemId === item.id;
              return (
                <View key={item.id} style={styles.itemRow}>
                  <Pressable
                    onPress={() => {
                      void Haptics.selectionAsync();
                      edit({ items: toggleItem(draft.items, item.id) });
                    }}
                    style={styles.check}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.checked }}
                    accessibilityLabel={item.text || '項目'}
                  >
                    <Icon name={item.checked ? 'checkmark.square.fill' : 'square'} size={24} color={item.checked ? c.subInk : c.ink} />
                  </Pressable>
                  <TextInput
                    value={item.text}
                    onChangeText={(text) => edit({ items: draft.items.map((i) => (i.id === item.id ? { ...i, text } : i)) })}
                    placeholder="項目"
                    placeholderTextColor={c.subInk}
                    autoFocus={focusItemId === item.id || (isNew === '1' && index === 0)}
                    onFocus={() => setEditingItemId(item.id)}
                    onBlur={() => setEditingItemId((cur) => (cur === item.id ? null : cur))}
                    onSubmitEditing={() => addItemAfter(item.id)}
                    submitBehavior="submit"
                    returnKeyType="next"
                    multiline={false}
                    style={[
                      type.body,
                      styles.itemInput,
                      { color: c.ink, fontWeight: theme.weight('400') },
                      item.checked && { textDecorationLine: 'line-through', color: c.subInk },
                    ]}
                  />
                  {/* 並べ替え・削除は入力中の行にだけ出して、普段は文字の幅を広く取る */}
                  {editing ? (
                    <View style={styles.rowActions}>
                      <RowAction icon="chevron.up" label="上へ移動" color={c.subInk} onPress={() => edit({ items: moveItem(draft.items, item.id, -1) })} />
                      <RowAction icon="chevron.down" label="下へ移動" color={c.subInk} onPress={() => edit({ items: moveItem(draft.items, item.id, 1) })} />
                      <RowAction icon="xmark.circle.fill" label="項目を削除" color={c.subInk} onPress={() => removeItem(item.id)} />
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Pressable
              onPress={() => addItemAfter(null)}
              style={({ pressed }) => [styles.addItem, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Icon name="plus.circle" size={22} color={c.subInk} />
              <Text style={[type.body, { color: c.subInk, fontWeight: '600' }]}>項目を追加</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function RowAction({ icon, label, color, onPress }: { icon: 'chevron.up' | 'chevron.down' | 'xmark.circle.fill'; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.5 }]}
    >
      <Icon name={icon} size={icon === 'xmark.circle.fill' ? 20 : 17} color={color} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  titleInput: { paddingVertical: 4 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, minHeight: 32 },
  bodyInput: { minHeight: 320, marginTop: 16, paddingTop: 0 },
  items: { marginTop: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH + 4 },
  check: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'flex-start', justifyContent: 'center' },
  itemInput: { flex: 1, minWidth: 0, paddingVertical: 10 },
  rowActions: { flexDirection: 'row' },
  rowAction: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  addItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: MIN_TOUCH + 4 },
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  unlockButton: { marginTop: 18, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 28, minHeight: 50, borderRadius: 25 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
