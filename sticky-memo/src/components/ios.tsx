import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { STICKY_COLORS } from '../domain/palette';
import type { StickyColorId } from '../domain/types';
import { Icon, type IconName } from './Icon';
import { MIN_TOUCH, radius, type, useTheme } from './theme';

/** iOS の「設定」アプリと同じ、角丸のグループ化リスト（insetGrouped） */
export function Section({ header, footer, children }: { header?: string; footer?: string; children: ReactNode }) {
  const { ui } = useTheme();
  return (
    <View style={styles.section}>
      {header ? (
        <Text style={[type.footnote, styles.sectionHeader, { color: ui.secondaryLabel }]} accessibilityRole="header">
          {header}
        </Text>
      ) : null}
      <View style={[styles.group, { backgroundColor: ui.surface }]}>{children}</View>
      {footer ? <Text style={[type.footnote, styles.sectionFooter, { color: ui.secondaryLabel }]}>{footer}</Text> : null}
    </View>
  );
}

/** 「設定」アプリ風の色付き角丸アイコン */
export function IconTile({ name, color }: { name: IconName; color: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <Icon name={name} size={17} color="#FFFFFF" weight="medium" />
    </View>
  );
}

export function Cell({
  icon,
  iconColor,
  title,
  detail,
  value,
  onPress,
  destructive,
  accessory,
  last,
  multilineDetail,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  accessory?: ReactNode;
  last?: boolean;
  multilineDetail?: boolean;
}) {
  const { ui, weight } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, value, detail].filter(Boolean).join('、')}
      style={({ pressed }) => [styles.cell, pressed && onPress ? { backgroundColor: ui.fill } : null]}
    >
      {icon ? <IconTile name={icon} color={iconColor ?? ui.accent} /> : null}
      <View style={[styles.cellBody, !last && { borderBottomColor: ui.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1, paddingVertical: 11 }}>
          <Text style={[type.body, { color: destructive ? ui.danger : ui.label, fontWeight: weight('400') }]}>{title}</Text>
          {detail ? (
            <Text style={[type.footnote, { color: ui.secondaryLabel, marginTop: 2 }]} numberOfLines={multilineDetail ? undefined : 2}>
              {detail}
            </Text>
          ) : null}
        </View>
        {value ? <Text style={[type.body, { color: ui.secondaryLabel }]}>{value}</Text> : null}
        {accessory ?? (onPress ? <Icon name="chevron.right" size={14} color={ui.tertiaryLabel} weight="semibold" /> : null)}
      </View>
    </Pressable>
  );
}

export function SwitchCell({
  icon,
  iconColor,
  title,
  detail,
  value,
  onValueChange,
  last,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  detail?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <Cell
      icon={icon}
      iconColor={iconColor}
      title={title}
      detail={detail}
      last={last}
      multilineDetail
      accessory={<Switch value={value} onValueChange={onValueChange} accessibilityLabel={title} />}
    />
  );
}

/** 選択肢を横に並べるセグメント（iOS の UISegmentedControl 風） */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { ui, scheme } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: ui.fill }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              active && { backgroundColor: scheme === 'dark' ? '#636366' : '#FFFFFF', boxShadow: '0px 1px 3px rgba(0,0,0,0.15)' },
            ]}
          >
            <Text style={[type.subheadline, { color: ui.label, fontWeight: active ? '600' : '400' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 12色の見本。色だけに頼らないよう、色名も必ず表示する */
export function ColorGrid({ value, onChange }: { value: StickyColorId; onChange: (id: StickyColorId) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.colorGrid} accessibilityRole="radiogroup">
      {STICKY_COLORS.map((c) => {
        const tone = theme.paper(c.id);
        const active = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={c.label}
            style={({ pressed }) => [styles.colorItem, pressed && { opacity: 0.7 }]}
          >
            <View
              style={[
                styles.colorSwatch,
                { backgroundColor: tone.paper, borderColor: active ? theme.ui.label : theme.ui.separator, borderWidth: active ? 3 : 1 },
              ]}
            >
              {active ? <Icon name="checkmark" size={20} color={tone.ink} weight="bold" /> : null}
            </View>
            <Text style={[type.caption1, { color: active ? theme.ui.label : theme.ui.secondaryLabel, fontWeight: active ? '700' : '400' }]} numberOfLines={1}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** シート上部の見出しと閉じるボタン */
export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { ui } = useTheme();
  return (
    <View style={styles.sheetHeader}>
      <Text style={[type.title3, { color: ui.label, flex: 1 }]} accessibilityRole="header">
        {title}
      </Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="閉じる" style={styles.close} hitSlop={4}>
        <View style={[styles.closeCircle, { backgroundColor: ui.fill }]}>
          <Icon name="xmark" size={13} color={ui.secondaryLabel} weight="bold" />
        </View>
      </Pressable>
    </View>
  );
}

/** シートの下部に置く主ボタン */
export function PrimaryButton({ title, onPress, disabled, icon }: { title: string; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  const { ui } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: disabled ? ui.fill : ui.accent },
        pressed && { opacity: 0.85 },
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={disabled ? ui.secondaryLabel : ui.onAccent} weight="semibold" /> : null}
      <Text style={[type.headline, { color: disabled ? ui.secondaryLabel : ui.onAccent }]}>{title}</Text>
    </Pressable>
  );
}

/** 押しやすい大きさ（44pt）の丸い候補ボタン */
export function Chip({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  const { ui } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? ui.label : ui.fill },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[type.subheadline, { color: active ? ui.surface : ui.label, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, marginHorizontal: 16 },
  sectionHeader: { marginLeft: 16, marginBottom: 7, textTransform: 'uppercase' },
  sectionFooter: { marginHorizontal: 16, marginTop: 7 },
  group: { borderRadius: radius.md, overflow: 'hidden' },
  cell: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, minHeight: MIN_TOUCH },
  cellBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, marginLeft: 0, minHeight: MIN_TOUCH },
  tile: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  segmented: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  colorItem: { width: '25%', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH },
  colorSwatch: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'flex-end', justifyContent: 'center' },
  closeCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: MIN_TOUCH, paddingHorizontal: 16, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
});
