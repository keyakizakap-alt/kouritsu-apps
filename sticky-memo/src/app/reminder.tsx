import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateTimeField } from '../components/DateTimeField';
import { Chip, PrimaryButton, SheetHeader } from '../components/ios';
import { formatReminder, MIN_TOUCH, type, useTheme } from '../components/theme';
import { useNote, useStore } from '../state/store';

const MINUTE = 60 * 1000;

function at(dayOffset: number, hour: number, minute: number): number {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/** Stibo の「アラーム／タイマー」に相当。端末内のローカル通知で知らせる */
export default function ReminderSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const note = useNote(id);
  const { setReminder } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState(() => new Date(note?.reminderAt ?? Math.ceil((now + 60 * MINUTE) / (5 * MINUTE)) * 5 * MINUTE));

  // 「過去の日時」判定やクイック候補が古くならないよう30秒ごとに現在時刻を更新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!note) return null;

  const apply = async (value: number | null) => {
    const ok = await setReminder(note.id, value);
    if (!ok && value !== null) {
      Alert.alert('通知を設定できませんでした', '「設定」アプリ > 通知 > 付箋メモ で通知を許可してください。');
      return;
    }
    router.back();
  };

  const quick: { label: string; resolve: () => number; preview: number }[] = [
    ...[10, 30, 60, 180].map((m) => ({
      label: m < 60 ? `${m}分後` : `${m / 60}時間後`,
      resolve: () => Date.now() + m * MINUTE,
      preview: now + m * MINUTE,
    })),
    { label: '今夜 20:00', resolve: () => at(0, 20, 0), preview: at(0, 20, 0) },
    { label: '明日 9:00', resolve: () => at(1, 9, 0), preview: at(1, 9, 0) },
  ].filter((q) => q.preview > now);

  const past = picked.getTime() <= now;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + 16 }]}>
      <SheetHeader title="リマインダー" onClose={() => router.back()} />
      {note.reminderAt ? (
        <View style={[styles.current, { backgroundColor: theme.ui.fill }]}>
          <Text style={[type.body, { color: theme.ui.label, flex: 1, fontWeight: '600' }]}>設定中：{formatReminder(note.reminderAt, now)}</Text>
          <Pressable onPress={() => void apply(null)} accessibilityRole="button" style={styles.remove}>
            <Text style={[type.body, { color: theme.ui.danger, fontWeight: '600' }]}>解除</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={[type.footnote, styles.label, { color: theme.ui.secondaryLabel }]} accessibilityRole="header">
        すぐに設定
      </Text>
      <View style={styles.chips}>
        {quick.map((q) => (
          <Chip key={q.label} label={q.label} onPress={() => void apply(q.resolve())} />
        ))}
      </View>

      <Text style={[type.footnote, styles.label, { color: theme.ui.secondaryLabel }]} accessibilityRole="header">
        日時を指定
      </Text>
      <DateTimeField value={picked} minimum={new Date(now)} onChange={setPicked} scheme={theme.scheme} />
      <View style={{ marginTop: 12 }}>
        <PrimaryButton
          icon="alarm"
          title={past ? '過去の日時は指定できません' : `${formatReminder(picked.getTime(), now)} に通知`}
          disabled={past}
          onPress={() => void apply(picked.getTime())}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20 },
  current: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 14, minHeight: 52 },
  remove: { minWidth: MIN_TOUCH * 1.5, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 18, marginBottom: 10, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
