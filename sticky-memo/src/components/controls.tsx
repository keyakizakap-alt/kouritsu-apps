import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STICKY_COLORS } from '../domain/palette';
import type { StickyColorId } from '../domain/types';
import { ui } from './theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function IconButton({
  icon,
  onPress,
  label,
  color = ui.ink,
  size = 22,
  tone = 'plain',
  compact,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  tone?: 'plain' | 'glass';
  /** リスト行内などで使う小さいボタン（28px、タップ領域は hitSlop で確保） */
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={compact ? 6 : 8}
      style={({ pressed }) => [styles.iconButton, compact && styles.compact, tone === 'glass' && styles.glass, pressed && { opacity: 0.55 }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function ColorSwatches({
  value,
  onChange,
  multiple,
  selected,
  size = 30,
}: {
  value?: StickyColorId;
  onChange: (id: StickyColorId) => void;
  multiple?: boolean;
  selected?: StickyColorId[];
  size?: number;
}) {
  return (
    <View style={styles.swatches}>
      {STICKY_COLORS.map((c) => {
        const active = multiple ? selected?.includes(c.id) : value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            accessibilityRole="button"
            accessibilityLabel={`${c.label}${active ? '（選択中）' : ''}`}
            style={[
              styles.swatch,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: c.paper },
              active && { borderColor: ui.ink, borderWidth: 2.5 },
            ]}
          >
            {active ? <Ionicons name="checkmark" size={size * 0.55} color={c.ink} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** 画面下からせり上がるシート */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <IconButton icon="close" label="閉じる" onPress={onClose} color={ui.subInk} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

export function Row({
  icon,
  label,
  detail,
  onPress,
  destructive,
  right,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: ReactNode;
}) {
  const color = destructive ? ui.danger : ui.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: ui.surfaceAlt }]}
    >
      {icon ? <Ionicons name={icon} size={20} color={destructive ? ui.danger : ui.subInk} style={{ width: 26 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={ui.faint} /> : null)}
    </Pressable>
  );
}

export function SwitchRow({
  icon,
  label,
  detail,
  value,
  onValueChange,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <Row
      icon={icon}
      label={label}
      detail={detail}
      right={<Switch value={value} onValueChange={onValueChange} accessibilityLabel={label} />}
    />
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Ionicons name={icon} size={15} color={active ? '#fff' : ui.ink} /> : null}
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.cardGroup}>{children}</View>;
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  compact: { width: 28, height: 28, borderRadius: 14 },
  glass: { backgroundColor: 'rgba(255,255,255,0.72)', boxShadow: ui.shadow.soft },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  scrim: { flex: 1, backgroundColor: 'rgba(15,12,8,0.35)' },
  sheet: {
    backgroundColor: ui.surface,
    borderTopLeftRadius: ui.radius.xl,
    borderTopRightRadius: ui.radius.xl,
    paddingHorizontal: 20,
    paddingTop: 8,
    boxShadow: ui.shadow.raised,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: ui.hairline, marginBottom: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: ui.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, minHeight: 52 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowDetail: { fontSize: 12.5, color: ui.subInk, marginTop: 2, lineHeight: 17 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: ui.surfaceAlt,
  },
  chipActive: { backgroundColor: ui.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: ui.ink },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: ui.subInk,
    letterSpacing: 0.6,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 6,
  },
  cardGroup: { backgroundColor: ui.surface, borderRadius: ui.radius.lg, overflow: 'hidden', boxShadow: ui.shadow.soft },
});
