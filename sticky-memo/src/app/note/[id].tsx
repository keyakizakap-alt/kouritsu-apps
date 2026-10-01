import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorSwatches, IconButton, Row, Sheet } from '../../components/controls';
import { ReminderSheet } from '../../components/ReminderSheet';
import { fontSizes, formatReminder, ui } from '../../components/theme';
import { WidgetSlotSheet } from '../../components/WidgetSlotSheet';
import { convertKind, isChecklistDone, moveItem, sinkChecked, toggleItem, uncheckAll } from '../../domain/notes';
import { stickyColor } from '../../domain/palette';
import type { ChecklistItem } from '../../domain/types';
import { authAvailability } from '../../security/auth';
import { useNote, useStore } from '../../state/store';

type Draft = { title: string; body: string; items: ChecklistItem[] };
const COMMIT_DELAY = 400;

export default function NoteEditor() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const insets = useSafeAreaInsets();
  const note = useNote(id);
  const store = useStore();
  const { settings, notes, updateNote, discardIfEmpty, moveToTrash, setWidgetSlot, setReminder, isNoteUnlocked, unlockNote, keepUnlocked } = store;

  const [draft, setDraft] = useState<Draft | null>(note ? { title: note.title, body: note.body, items: note.items } : null);
  const [sheet, setSheet] = useState<null | 'color' | 'reminder' | 'widget' | 'more'>(null);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
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
      <View style={[styles.missing, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.missingText}>この付箋は見つかりませんでした</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: ui.accent, fontWeight: '700', marginTop: 12 }}>戻る</Text>
        </Pressable>
      </View>
    );
  }

  const c = stickyColor(note.color);
  const f = fontSizes(settings.fontScale);
  const dark = note.color === 'graphite';
  const unlocked = isNoteUnlocked(note.id);
  const done = isChecklistDone({ ...note, items: draft.items });

  const back = () => {
    flush();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

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
    setSheet(null);
    if (note.locked) {
      if (await unlockNote(note.id)) updateNote(note.id, { locked: false });
      return;
    }
    if ((await authAvailability()) === 'none') {
      Alert.alert('ロックを使えません', '端末に Face ID・指紋認証・パスコードのいずれかを設定してください。');
      return;
    }
    flush();
    // ロックした本人はこのセッション中は引き続き閲覧できるよう解除状態にしておく
    keepUnlocked(note.id);
    updateNote(note.id, { locked: true });
  };

  const confirmDelete = () => {
    setSheet(null);
    Alert.alert('ゴミ箱に移動しますか？', 'ゴミ箱の付箋は30日後に完全に削除されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ゴミ箱へ',
        style: 'destructive',
        onPress: async () => {
          flush();
          await moveToTrash(note.id);
          back();
        },
      },
    ]);
  };

  const changeKind = () => {
    setSheet(null);
    flush();
    const next = convertKind({ ...note, ...draft }, note.kind === 'text' ? 'checklist' : 'text', () => Crypto.randomUUID());
    setDraft({ title: draft.title, body: next.body, items: next.items });
    updateNote(note.id, { title: draft.title, ...next });
  };

  const iconColor = c.ink;

  if (note.locked && !unlocked) {
    return (
      <View style={[styles.root, { backgroundColor: c.paper, paddingTop: insets.top }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={styles.topBar}>
          <IconButton icon="chevron-back" label="戻る" onPress={back} color={iconColor} />
        </View>
        <View style={styles.lockedWrap}>
          <Ionicons name="lock-closed" size={44} color={c.subInk} />
          <Text style={[styles.lockedTitle, { color: c.ink }]}>{note.title || 'ロックされた付箋'}</Text>
          <Text style={[styles.lockedText, { color: c.subInk }]}>Face ID・指紋認証・端末のパスコードで開けます</Text>
          <Pressable onPress={() => void unlockNote(note.id)} style={[styles.unlockButton, { backgroundColor: c.ink }]} accessibilityRole="button">
            <Text style={[styles.unlockText, { color: c.paper }]}>ロックを解除</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={[styles.topBar, { paddingTop: insets.top + 4, backgroundColor: c.band }]}>
        <IconButton icon="chevron-back" label="戻る" onPress={back} color={iconColor} />
        <View style={{ flex: 1 }} />
        <IconButton
          icon={note.pinned ? 'pin' : 'pin-outline'}
          label={note.pinned ? 'ピン留めを外す' : 'ピン留め'}
          onPress={() => {
            void Haptics.selectionAsync();
            updateNote(note.id, { pinned: !note.pinned });
          }}
          color={iconColor}
        />
        <IconButton icon="ellipsis-horizontal-circle-outline" label="その他の操作" onPress={() => setSheet('more')} color={iconColor} />
      </View>

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <TextInput
          value={draft.title}
          onChangeText={(title) => edit({ title })}
          placeholder="タイトル"
          placeholderTextColor={c.subInk + '99'}
          style={[styles.titleInput, { color: c.ink, fontSize: f.editorTitle }, done && { textDecorationLine: 'line-through' }]}
          returnKeyType="next"
          maxLength={120}
        />

        {(note.reminderAt || note.widgetSlot) ? (
          <View style={styles.tags}>
            {note.reminderAt ? (
              <Pressable onPress={() => setSheet('reminder')} style={[styles.tag, { borderColor: c.subInk + '55' }]}>
                <Ionicons name="alarm-outline" size={14} color={c.subInk} />
                <Text style={[styles.tagText, { color: c.subInk }]}>{formatReminder(note.reminderAt)}</Text>
              </Pressable>
            ) : null}
            {note.widgetSlot ? (
              <Pressable onPress={() => setSheet('widget')} style={[styles.tag, { borderColor: c.subInk + '55' }]}>
                <Ionicons name="apps-outline" size={14} color={c.subInk} />
                <Text style={[styles.tagText, { color: c.subInk }]}>ウィジェット {note.widgetSlot}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {note.kind === 'text' ? (
          <TextInput
            value={draft.body}
            onChangeText={(body) => edit({ body })}
            placeholder="メモを入力"
            placeholderTextColor={c.subInk + '99'}
            multiline
            autoFocus={isNew === '1'}
            textAlignVertical="top"
            style={[styles.bodyInput, { color: c.ink, fontSize: f.editorBody, lineHeight: f.editorBody * 1.6 }]}
          />
        ) : (
          <View style={styles.items}>
            {draft.items.map((item, index) => (
              <View key={item.id} style={styles.itemRow}>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    edit({ items: toggleItem(draft.items, item.id) });
                  }}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  accessibilityLabel={item.text || '項目'}
                >
                  <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={24} color={item.checked ? c.subInk : c.ink} />
                </Pressable>
                <TextInput
                  value={item.text}
                  onChangeText={(text) => edit({ items: draft.items.map((i) => (i.id === item.id ? { ...i, text } : i)) })}
                  placeholder="項目"
                  placeholderTextColor={c.subInk + '88'}
                  autoFocus={focusItemId === item.id || (isNew === '1' && index === 0)}
                  onSubmitEditing={() => addItemAfter(item.id)}
                  submitBehavior="submit"
                  returnKeyType="next"
                  style={[
                    styles.itemInput,
                    { color: c.ink, fontSize: f.editorBody },
                    item.checked && { textDecorationLine: 'line-through', color: c.subInk },
                  ]}
                />
                <IconButton compact icon="chevron-up" size={16} label="上へ移動" color={c.subInk} onPress={() => edit({ items: moveItem(draft.items, item.id, -1) })} />
                <IconButton compact icon="chevron-down" size={16} label="下へ移動" color={c.subInk} onPress={() => edit({ items: moveItem(draft.items, item.id, 1) })} />
                <IconButton compact icon="close" size={16} label="項目を削除" color={c.subInk} onPress={() => removeItem(item.id)} />
              </View>
            ))}
            <Pressable onPress={() => addItemAfter(null)} style={styles.addItem} accessibilityRole="button">
              <Ionicons name="add" size={22} color={c.subInk} />
              <Text style={[styles.addItemText, { color: c.subInk }]}>項目を追加</Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.stamp, { color: c.subInk }]}>
          作成 {new Date(note.createdAt).toLocaleString('ja-JP')} ・ 更新 {new Date(note.updatedAt).toLocaleString('ja-JP')}
        </Text>
      </ScrollView>

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 6, backgroundColor: c.band }]}>
        <ToolButton icon="color-palette-outline" label="色" color={iconColor} onPress={() => setSheet('color')} />
        <ToolButton icon={note.reminderAt ? 'alarm' : 'alarm-outline'} label="通知" color={iconColor} onPress={() => setSheet('reminder')} />
        <ToolButton icon={note.widgetSlot ? 'apps' : 'apps-outline'} label="ウィジェット" color={iconColor} onPress={() => setSheet('widget')} />
        <ToolButton icon={note.locked ? 'lock-closed' : 'lock-open-outline'} label="ロック" color={iconColor} onPress={toggleLock} />
        <ToolButton icon="trash-outline" label="削除" color={iconColor} onPress={confirmDelete} />
      </View>

      <Sheet visible={sheet === 'color'} onClose={() => setSheet(null)} title="付箋の色">
        <ColorSwatches value={note.color} onChange={(color) => updateNote(note.id, { color })} size={40} />
        <View style={{ height: 8 }} />
      </Sheet>

      <ReminderSheet
        visible={sheet === 'reminder'}
        current={note.reminderAt}
        onClose={() => setSheet(null)}
        onSet={async (at) => {
          setSheet(null);
          flush();
          const ok = await setReminder(note.id, at);
          if (!ok && at !== null) {
            Alert.alert('通知を設定できませんでした', '端末の設定でこのアプリの通知を許可してください。');
          }
        }}
      />

      <WidgetSlotSheet
        visible={sheet === 'widget'}
        note={note}
        notes={notes}
        onClose={() => setSheet(null)}
        onSelect={(slot) => {
          flush();
          setWidgetSlot(note.id, slot);
        }}
      />

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)} title="その他">
        <View style={styles.moreList}>
          <Row
            icon={note.kind === 'text' ? 'checkbox-outline' : 'document-text-outline'}
            label={note.kind === 'text' ? 'チェックリストに変換' : 'テキストに変換'}
            detail={note.kind === 'text' ? '1行ごとに1項目になります' : 'チェック状態は失われます'}
            onPress={changeKind}
          />
          {note.kind === 'checklist' ? (
            <>
              <Row icon="arrow-down-outline" label="チェック済みを下へ" onPress={() => { setSheet(null); edit({ items: sinkChecked(draft.items) }); }} />
              <Row icon="refresh-outline" label="すべてのチェックを外す" onPress={() => { setSheet(null); edit({ items: uncheckAll(draft.items) }); }} />
            </>
          ) : null}
          <Row icon={note.locked ? 'lock-open-outline' : 'lock-closed-outline'} label={note.locked ? 'ロックを解除' : 'この付箋をロック'} onPress={toggleLock} />
          <Row icon="trash-outline" label="ゴミ箱に移動" destructive onPress={confirmDelete} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function ToolButton({ icon, label, color, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.toolLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  page: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40 },
  titleInput: { fontWeight: '800', paddingVertical: 4, letterSpacing: 0.3 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontSize: 12.5, fontWeight: '600' },
  bodyInput: { minHeight: 320, marginTop: 12, paddingVertical: 0 },
  items: { marginTop: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  itemInput: { flex: 1, minWidth: 0, paddingVertical: 8, marginLeft: 4 },
  addItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  addItemText: { fontSize: 15, fontWeight: '600' },
  stamp: { fontSize: 11.5, marginTop: 28, opacity: 0.8 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6 },
  tool: { alignItems: 'center', minWidth: 60, paddingVertical: 4, gap: 2 },
  toolLabel: { fontSize: 10.5, fontWeight: '600' },
  moreList: { marginHorizontal: -16, marginBottom: 4 },
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, marginTop: -60 },
  lockedTitle: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  lockedText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  unlockButton: { marginTop: 18, paddingHorizontal: 28, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  unlockText: { fontSize: 16, fontWeight: '700' },
  missing: { flex: 1, alignItems: 'center', backgroundColor: ui.surface },
  missingText: { fontSize: 16, color: ui.subInk },
});
