import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorGrid, SheetHeader } from '../components/ios';
import { type, useTheme } from '../components/theme';
import type { StickyColorId } from '../domain/types';
import { useNote, useStore } from '../state/store';

/** 付箋の色を選ぶシート。id=default のときは「新しい付箋の色」を設定する */
export default function ColorSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const note = useNote(id === 'default' ? undefined : id);
  const { settings, updateNote, updateSettings } = useStore();
  const value = id === 'default' ? settings.defaultColor : note?.color ?? settings.defaultColor;
  const tone = theme.paper(value);

  const choose = (color: StickyColorId) => {
    void Haptics.selectionAsync();
    if (id === 'default') updateSettings({ defaultColor: color });
    else if (note) updateNote(note.id, { color });
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 16 }]}>
      <SheetHeader title={id === 'default' ? '新しい付箋の色' : '付箋の色'} onClose={() => router.back()} />
      {/* 選んだ色で本文と補足文字がどう見えるかをその場で確認できる見本 */}
      <View style={[styles.preview, { backgroundColor: tone.paper, boxShadow: theme.shadow.card }]} accessible accessibilityLabel="見本">
        <View style={[styles.band, { backgroundColor: tone.band }]} />
        <Text style={[type.headline, { color: tone.ink }]}>{note?.locked ? 'ロックされた付箋' : note?.title || '見本のタイトル'}</Text>
        <Text style={[type.footnote, { color: tone.subInk, marginTop: 2 }]}>本文はこの濃さで表示されます</Text>
      </View>
      <ColorGrid value={value} onChange={choose} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20 },
  preview: { borderRadius: 6, borderBottomRightRadius: 18, padding: 14, paddingTop: 16, marginBottom: 20, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
});
