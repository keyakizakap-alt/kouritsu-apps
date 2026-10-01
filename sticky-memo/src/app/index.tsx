import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop, headerTone } from '../components/Backdrop';
import { Chip, ColorSwatches, IconButton, Sheet } from '../components/controls';
import { StickyCard } from '../components/StickyCard';
import { ui } from '../components/theme';
import { selectVisibleNotes, toggleItem } from '../domain/notes';
import type { Note, NoteKind, SortMode, StickyColorId } from '../domain/types';
import { useStore } from '../state/store';

const SORT_LABELS: Record<SortMode, string> = {
  updated: '更新日時',
  created: '作成日時',
  color: '色',
  title: 'タイトル',
  reminder: 'リマインダー',
};

function estimateHeight(note: Note): number {
  if (note.locked) return 110;
  if (note.kind === 'checklist') return 90 + Math.min(6, note.items.length) * 24;
  return 90 + Math.min(7, Math.ceil(note.body.length / 14)) * 20;
}

/** 2列の石組み（masonry）レイアウト：低い列へ順に積む */
function splitColumns(notes: Note[]): [Note[], Note[]] {
  const cols: [Note[], Note[]] = [[], []];
  const heights = [0, 0];
  for (const n of notes) {
    const i = heights[0] <= heights[1] ? 0 : 1;
    cols[i].push(n);
    heights[i] += estimateHeight(n) + 16;
  }
  return cols;
}

export default function BoardScreen() {
  const insets = useSafeAreaInsets();
  const { notes, settings, updateSettings, createNote, updateNote } = useStore();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [colors, setColors] = useState<StickyColorId[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const visible = useMemo(
    () => selectVisibleNotes(notes, { search, colors, sort: settings.sortMode }),
    [notes, search, colors, settings.sortMode],
  );
  const totalLive = useMemo(() => notes.filter((n) => n.deletedAt === null).length, [notes]);
  const tone = headerTone(settings.background);
  const headerInk = tone === 'light' ? '#FFFFFF' : ui.ink;
  const headerSub = tone === 'light' ? 'rgba(255,255,255,0.75)' : ui.subInk;
  const board = settings.viewMode === 'board';
  const [left, right] = useMemo(() => splitColumns(visible), [visible]);

  const open = (id: string) => router.push(`/note/${id}`);
  const toggle = (note: Note) => (itemId: string) => {
    void Haptics.selectionAsync();
    updateNote(note.id, { items: toggleItem(note.items, itemId) });
  };
  const add = async (kind: NoteKind) => {
    setAddOpen(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = await createNote(kind);
    router.push(`/note/${id}?new=1`);
  };

  const renderCard = (note: Note) => (
    <StickyCard
      key={note.id}
      note={note}
      variant={board ? 'board' : 'list'}
      fontScale={settings.fontScale}
      onPress={() => open(note.id)}
      onToggleItem={note.locked ? undefined : toggle(note)}
    />
  );

  const filtered = colors.length > 0 || search.trim() !== '';

  return (
    <View style={styles.root}>
      <Backdrop background={settings.background} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.largeTitle, { color: headerInk }]}>付箋</Text>
            <Text style={[styles.subtitle, { color: headerSub }]}>
              {filtered ? `${visible.length} / ${totalLive} 枚` : `${totalLive} 枚`}
            </Text>
          </View>
          <IconButton tone="glass" icon="search" label="検索" onPress={() => setSearching((v) => !v)} />
          <IconButton
            tone="glass"
            icon={colors.length ? 'funnel' : 'funnel-outline'}
            label="絞り込みと並べ替え"
            onPress={() => setFilterOpen(true)}
          />
          <IconButton
            tone="glass"
            icon={board ? 'list' : 'grid'}
            label={board ? 'リスト表示に切り替え' : 'ボード表示に切り替え'}
            onPress={() => updateSettings({ viewMode: board ? 'list' : 'board' })}
          />
          <IconButton tone="glass" icon="settings-outline" label="設定" onPress={() => router.push('/settings')} />
        </View>
        {searching ? (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={ui.subInk} />
            <TextInput
              autoFocus
              value={search}
              onChangeText={setSearch}
              placeholder="付箋を検索"
              placeholderTextColor={ui.faint}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {search ? <IconButton icon="close-circle" size={18} color={ui.faint} label="検索をクリア" onPress={() => setSearch('')} /> : null}
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardDismissMode="on-drag"
      >
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyNote}>
              <Ionicons name={filtered ? 'search' : 'create-outline'} size={30} color="#7A6C35" />
              <Text style={styles.emptyTitle}>{filtered ? '見つかりませんでした' : '最初の付箋を貼りましょう'}</Text>
              <Text style={styles.emptyText}>
                {filtered
                  ? '検索語や色の絞り込みを変えてみてください'
                  : '右下の ＋ からメモやチェックリストを作成。\nホーム画面のウィジェットにも貼れます。'}
              </Text>
            </View>
          </View>
        ) : board ? (
          <View style={styles.columns}>
            <View style={styles.column}>{left.map(renderCard)}</View>
            <View style={styles.column}>{right.map(renderCard)}</View>
          </View>
        ) : (
          <View style={styles.list}>{visible.map(renderCard)}</View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => setAddOpen(true)}
        onLongPress={() => add('text')}
        accessibilityRole="button"
        accessibilityLabel="付箋を追加"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          tone === 'light' && { backgroundColor: '#FFFDF9' },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <Ionicons name="add" size={32} color={tone === 'light' ? ui.ink : '#fff'} />
      </Pressable>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="新しい付箋">
        <View style={styles.addRow}>
          <Pressable style={[styles.addCard, { backgroundColor: '#FFF3A3' }]} onPress={() => add('text')} accessibilityRole="button">
            <Ionicons name="document-text-outline" size={28} color="#3D3519" />
            <Text style={styles.addTitle}>テキスト</Text>
            <Text style={styles.addText}>自由に書くメモ</Text>
          </Pressable>
          <Pressable style={[styles.addCard, { backgroundColor: '#D3F5C9' }]} onPress={() => add('checklist')} accessibilityRole="button">
            <Ionicons name="checkbox-outline" size={28} color="#1F3E19" />
            <Text style={styles.addTitle}>チェックリスト</Text>
            <Text style={styles.addText}>ToDo・買い物リスト</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="絞り込み・並べ替え">
        <Text style={styles.sheetLabel}>色で絞り込み</Text>
        <ColorSwatches
          multiple
          selected={colors}
          onChange={(id) => setColors((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))}
        />
        {colors.length ? (
          <Pressable onPress={() => setColors([])} style={{ marginTop: 10 }}>
            <Text style={{ color: ui.accent, fontWeight: '600' }}>色の絞り込みを解除</Text>
          </Pressable>
        ) : null}
        <Text style={styles.sheetLabel}>並べ替え</Text>
        <View style={styles.chips}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <Chip key={mode} label={SORT_LABELS[mode]} active={settings.sortMode === mode} onPress={() => updateSettings({ sortMode: mode })} />
          ))}
        </View>
        <Text style={styles.hint}>ピン留めした付箋は常に先頭に表示されます。</Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#C79A6B' },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  largeTitle: { fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  searchBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingLeft: 12,
    height: 44,
    boxShadow: ui.shadow.soft,
  },
  searchInput: { flex: 1, fontSize: 16, color: ui.ink, paddingVertical: 0 },
  content: { paddingHorizontal: 14, paddingTop: 10 },
  columns: { flexDirection: 'row', gap: 14 },
  column: { flex: 1, gap: 16 },
  list: { gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyNote: {
    width: 260,
    padding: 22,
    backgroundColor: '#FFF3A3',
    borderRadius: 4,
    borderBottomRightRadius: 22,
    transform: [{ rotate: '-2deg' }],
    boxShadow: ui.shadow.card,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#3D3519' },
  emptyText: { fontSize: 13.5, lineHeight: 20, color: '#5E5427' },
  fab: {
    position: 'absolute',
    right: 22,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ui.ink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: ui.shadow.raised,
  },
  addRow: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  addCard: {
    flex: 1,
    padding: 16,
    borderRadius: 6,
    borderBottomRightRadius: 20,
    gap: 6,
    boxShadow: ui.shadow.card,
  },
  addTitle: { fontSize: 16, fontWeight: '700', color: ui.ink, marginTop: 4 },
  addText: { fontSize: 12.5, color: ui.subInk },
  sheetLabel: { fontSize: 13, fontWeight: '700', color: ui.subInk, marginTop: 12, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12, color: ui.faint, marginTop: 14, marginBottom: 4 },
});
