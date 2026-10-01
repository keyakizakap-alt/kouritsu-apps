import * as Haptics from 'expo-haptics';
import { Link, router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Backdrop, backgroundTone } from '../components/Backdrop';
import { Icon } from '../components/Icon';
import { StickyCard } from '../components/StickyCard';
import { radius, type, useTheme, WEB_HEADER_INSET } from '../components/theme';
import { selectVisibleNotes, toggleItem } from '../domain/notes';
import { STICKY_COLORS } from '../domain/palette';
import type { Note, NoteKind, SortMode, StickyColorId } from '../domain/types';
import { WIDGET_SLOTS } from '../domain/types';
import { useStore } from '../state/store';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'updated', label: '更新日時' },
  { value: 'created', label: '作成日時' },
  { value: 'title', label: 'タイトル' },
  { value: 'color', label: '色' },
  { value: 'reminder', label: 'リマインダー' },
];

function estimateHeight(note: Note): number {
  if (note.locked) return 110;
  if (note.kind === 'checklist') return 90 + Math.min(6, note.items.length) * 34;
  return 90 + Math.min(8, Math.ceil(note.body.length / 10)) * 22;
}

/** 2列の石組み（masonry）レイアウト：低い列へ順に積む */
function splitColumns(notes: Note[]): [Note[], Note[]] {
  const cols: [Note[], Note[]] = [[], []];
  const heights = [0, 0];
  for (const n of notes) {
    const i = heights[0] <= heights[1] ? 0 : 1;
    cols[i].push(n);
    heights[i] += estimateHeight(n) + 14;
  }
  return cols;
}

export default function BoardScreen() {
  const theme = useTheme();
  const { notes, settings, updateSettings, createNote, updateNote, setWidgetSlot, moveToTrash } = useStore();
  const [search, setSearch] = useState('');
  const [colors, setColors] = useState<StickyColorId[]>([]);

  const visible = useMemo(
    () => selectVisibleNotes(notes, { search, colors, sort: settings.sortMode }),
    [notes, search, colors, settings.sortMode],
  );
  const totalLive = useMemo(() => notes.filter((n) => n.deletedAt === null).length, [notes]);
  const tone = backgroundTone(settings.background, theme.scheme);
  // 文字を大きくしている場合は1列にして、付箋の幅を確保する
  const board = settings.viewMode === 'board' && !theme.singleColumn;
  const [left, right] = useMemo(() => splitColumns(visible), [visible]);
  const filtered = colors.length > 0 || search.trim() !== '';

  const add = async (kind: NoteKind) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = await createNote(kind);
    router.push(`/note/${id}?new=1`);
  };

  const toggle = (note: Note) => (itemId: string) => {
    void Haptics.selectionAsync();
    updateNote(note.id, { items: toggleItem(note.items, itemId) });
  };

  const renderCard = (note: Note) => (
    <Link key={note.id} href={`/note/${note.id}`} asChild>
      <Link.Trigger>
        <StickyCard note={note} variant={board ? 'board' : 'list'} onToggleItem={note.locked ? undefined : toggle(note)} />
      </Link.Trigger>
      {note.locked ? null : <Link.Preview />}
      <Link.Menu>
        <Link.MenuAction
          title={note.pinned ? 'ピン留めを外す' : 'ピン留め'}
          icon={note.pinned ? 'pin.slash' : 'pin'}
          onPress={() => updateNote(note.id, { pinned: !note.pinned })}
        />
        <Link.Menu title="ウィジェットに貼る" icon="widget.small">
          {WIDGET_SLOTS.map((slot) => (
            <Link.MenuAction
              key={slot}
              title={`スロット ${slot}`}
              isOn={note.widgetSlot === slot}
              onPress={() => setWidgetSlot(note.id, note.widgetSlot === slot ? null : slot)}
            />
          ))}
        </Link.Menu>
        <Link.MenuAction title="色を変える" icon="paintpalette" onPress={() => router.push({ pathname: '/color', params: { id: note.id } })} />
        <Link.MenuAction
          title="ゴミ箱に移動"
          icon="trash"
          destructive
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void moveToTrash(note.id);
          }}
        />
      </Link.Menu>
    </Link>
  );

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <StatusBar style={tone.barStyle} />
      <Stack.Screen
        options={{
          title: '付箋',
          headerLargeTitleEnabled: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerTitleStyle: { color: tone.onBackground },
          headerLargeTitleStyle: { color: tone.onBackground },
          headerTintColor: tone.onBackground,
          headerSearchBarOptions: {
            placeholder: '付箋を検索',
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
            cancelButtonText: 'キャンセル',
            hideWhenScrolling: true,
            textColor: tone.onBackground,
            hintTextColor: tone.onBackground,
            headerIconColor: tone.onBackground,
          },
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          icon={colors.length ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle'}
          accessibilityLabel="表示・並べ替え・絞り込み"
        >
          <Stack.Toolbar.Menu inline title="表示">
            <Stack.Toolbar.MenuAction icon="square.grid.2x2" isOn={settings.viewMode === 'board'} onPress={() => updateSettings({ viewMode: 'board' })}>
              ボード
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="list.bullet" isOn={settings.viewMode === 'list'} onPress={() => updateSettings({ viewMode: 'list' })}>
              リスト
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu title="並べ替え" icon="arrow.up.arrow.down">
            {SORT_OPTIONS.map((o) => (
              <Stack.Toolbar.MenuAction key={o.value} isOn={settings.sortMode === o.value} onPress={() => updateSettings({ sortMode: o.value })}>
                {o.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu title="色で絞り込み" icon="paintpalette">
            <Stack.Toolbar.MenuAction isOn={colors.length === 0} onPress={() => setColors([])}>
              すべての色
            </Stack.Toolbar.MenuAction>
            {STICKY_COLORS.map((c) => (
              <Stack.Toolbar.MenuAction
                key={c.id}
                isOn={colors.includes(c.id)}
                onPress={() => setColors((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
              >
                {c.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="設定" onPress={() => router.push('/settings')} />
      </Stack.Toolbar>
      {/* iOS の「メモ」と同じく、下部ツールバーに件数と新規作成を置く */}
      <Stack.Toolbar>
        <Stack.Toolbar.Button icon="checklist" accessibilityLabel="新しいチェックリスト" onPress={() => void add('checklist')} />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.View>
          <Text style={[type.caption1, { color: tone.onBackground, fontWeight: '600' }]} accessibilityLiveRegion="polite">
            {filtered ? `${visible.length} / ${totalLive} 枚` : `${totalLive} 枚の付箋`}
          </Text>
        </Stack.Toolbar.View>
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button icon="square.and.pencil" accessibilityLabel="新しい付箋" onPress={() => void add('text')} />
      </Stack.Toolbar>

      <Backdrop background={settings.background} scheme={theme.scheme} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
      >
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyNote, { backgroundColor: theme.paper('lemon').paper, boxShadow: theme.shadow.card }]}>
              <Icon name={filtered ? 'magnifyingglass' : 'square.and.pencil'} size={30} color={theme.paper('lemon').subInk} />
              <Text style={[type.title3, { color: theme.paper('lemon').ink }]}>
                {filtered ? '見つかりませんでした' : '最初の付箋を貼りましょう'}
              </Text>
              <Text style={[type.subheadline, { color: theme.paper('lemon').ink }]}>
                {filtered
                  ? '検索語や色の絞り込みを変えてみてください。'
                  : '右下の作成ボタンでメモ、左下でチェックリストを作れます。ホーム画面のウィジェットにも貼れます。'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 + WEB_HEADER_INSET, paddingBottom: 32 },
  columns: { flexDirection: 'row', gap: 14 },
  column: { flex: 1, gap: 14 },
  list: { gap: 12 },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyNote: { width: 290, padding: 22, borderRadius: 6, borderBottomRightRadius: radius.xl, transform: [{ rotate: '-1.5deg' }], gap: 10 },
});
