import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip, IconButton, Sheet } from './controls';
import { formatReminder, ui } from './theme';

type Props = {
  visible: boolean;
  current: number | null;
  onClose: () => void;
  onSet: (at: number | null) => void;
};

function at(dayOffset: number, hour: number, minute: number): number {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

const DAY_LABELS = ['今日', '明日', '明後日'];

function initialPick(current: number | null, now: number) {
  const base = new Date(current ?? now + 60 * 60 * 1000);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return {
    day: Math.max(0, Math.round((new Date(base).setHours(0, 0, 0, 0) - today.getTime()) / 86400000)),
    hour: base.getHours(),
    minute: Math.floor(base.getMinutes() / 5) * 5,
  };
}

/** Stibo の「アラーム／タイマー」に相当。端末内のローカル通知で知らせる */
export function ReminderSheet({ visible, current, onClose, onSet }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title="リマインダー">
      {visible ? <ReminderBody current={current} onSet={onSet} /> : null}
    </Sheet>
  );
}

function ReminderBody({ current, onSet }: Pick<Props, 'current' | 'onSet'>) {
  const [now, setNow] = useState(() => Date.now());
  const [pick, setPick] = useState(() => initialPick(current, now));
  const { day, hour, minute } = pick;
  const setDay = (fn: (d: number) => number) => setPick((p) => ({ ...p, day: fn(p.day) }));
  const setHour = (fn: (h: number) => number) => setPick((p) => ({ ...p, hour: fn(p.hour) }));
  const setMinute = (fn: (m: number) => number) => setPick((p) => ({ ...p, minute: fn(p.minute) }));

  // 「過去の日時」判定やクイック候補が古くならないよう30秒ごとに現在時刻を更新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // 相対指定（◯分後）は押した瞬間を基準に、絶対指定（今夜20時など）はその時刻で設定する
  const MINUTE = 60 * 1000;
  const quick: { label: string; resolve: () => number; preview: number }[] = [
    ...[10, 30, 60, 180].map((m) => ({
      label: m < 60 ? `${m}分後` : `${m / 60}時間後`,
      resolve: () => Date.now() + m * MINUTE,
      preview: now + m * MINUTE,
    })),
    { label: '今夜 20:00', resolve: () => at(0, 20, 0), preview: at(0, 20, 0) },
    { label: '明日 9:00', resolve: () => at(1, 9, 0), preview: at(1, 9, 0) },
  ].filter((q) => q.preview > now);

  const custom = at(day, hour, minute);
  const past = custom <= now;
  const dayLabel = day < DAY_LABELS.length ? DAY_LABELS[day] : `${day}日後`;

  return (
    <>
      {current ? (
        <View style={styles.currentRow}>
          <Text style={styles.currentText}>設定中：{formatReminder(current)}</Text>
          <Pressable onPress={() => onSet(null)} accessibilityRole="button">
            <Text style={styles.remove}>解除</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.label}>すぐに設定</Text>
      <View style={styles.chips}>
        {quick.map((q) => (
          <Chip key={q.label} label={q.label} onPress={() => onSet(q.resolve())} />
        ))}
      </View>

      <Text style={styles.label}>日時を指定</Text>
      <View style={styles.picker}>
        <Stepper value={dayLabel} onMinus={() => setDay((d) => Math.max(0, d - 1))} onPlus={() => setDay((d) => Math.min(60, d + 1))} label="日" />
        <Stepper value={`${hour}時`} onMinus={() => setHour((h) => (h + 23) % 24)} onPlus={() => setHour((h) => (h + 1) % 24)} label="時" />
        <Stepper
          value={`${String(minute).padStart(2, '0')}分`}
          onMinus={() => setMinute((m) => (m + 55) % 60)}
          onPlus={() => setMinute((m) => (m + 5) % 60)}
          label="分"
        />
      </View>
      <Pressable
        disabled={past}
        onPress={() => onSet(custom)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, past && { opacity: 0.35 }, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.primaryText}>{past ? '過去の日時は設定できません' : `${formatReminder(custom, now)} に通知`}</Text>
      </Pressable>
    </>
  );
}

function Stepper({ value, onMinus, onPlus, label }: { value: string; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
    <View style={styles.stepper}>
      <IconButton icon="chevron-up" label={`${label}を進める`} onPress={onPlus} color={ui.subInk} />
      <Text style={styles.stepValue}>{value}</Text>
      <IconButton icon="chevron-down" label={`${label}を戻す`} onPress={onMinus} color={ui.subInk} />
    </View>
  );
}

const styles = StyleSheet.create({
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ui.surfaceAlt,
    borderRadius: ui.radius.md,
    padding: 12,
  },
  currentText: { fontSize: 15, fontWeight: '600', color: ui.ink },
  remove: { color: ui.danger, fontWeight: '700', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '700', color: ui.subInk, marginTop: 14, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picker: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: ui.surfaceAlt, borderRadius: ui.radius.lg, paddingVertical: 4 },
  stepper: { alignItems: 'center', minWidth: 80 },
  stepValue: { fontSize: 20, fontWeight: '700', color: ui.ink, fontVariant: ['tabular-nums'] },
  primary: { marginTop: 14, backgroundColor: ui.ink, borderRadius: ui.radius.md, height: 50, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
