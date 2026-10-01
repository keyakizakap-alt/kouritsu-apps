import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Chip, ColorSwatches, IconButton, Row, SectionLabel, SwitchRow } from '../components/controls';
import { ui } from '../components/theme';
import { selectTrash } from '../domain/notes';
import { BACKGROUND_PRESETS } from '../domain/palette';
import type { AutoLockDelay, FontScale } from '../domain/types';
import { authAvailability, authenticate, type AuthAvailability } from '../security/auth';
import { useStore } from '../state/store';
import { deleteBackgroundPhoto, pickBackgroundPhoto } from '../storage/backgroundImage';
import { requestAddWidget } from '../widgets/sync';

const LOCK_DELAYS: { value: AutoLockDelay; label: string }[] = [
  { value: 0, label: 'すぐに' },
  { value: 60, label: '1分後' },
  { value: 300, label: '5分後' },
  { value: 900, label: '15分後' },
];

const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
];

const DIMS = [
  { value: 0, label: 'なし' },
  { value: 0.15, label: '弱' },
  { value: 0.3, label: '中' },
  { value: 0.5, label: '強' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, notes } = useStore();
  const [auth, setAuth] = useState<AuthAvailability>('none');
  const trashCount = selectTrash(notes).length;

  useEffect(() => {
    void authAvailability().then(setAuth);
  }, []);

  const bg = settings.background;

  const choosePhoto = async () => {
    try {
      const uri = await pickBackgroundPhoto();
      if (!uri) return;
      if (bg.type === 'photo') deleteBackgroundPhoto(bg.uri);
      updateSettings({ background: { type: 'photo', uri, dim: 0.15 } });
    } catch {
      Alert.alert('写真を読み込めませんでした', '写真へのアクセスを許可しているか確認してください。');
    }
  };

  const choosePreset = (id: (typeof BACKGROUND_PRESETS)[number]['id']) => {
    if (bg.type === 'photo') deleteBackgroundPhoto(bg.uri);
    updateSettings({ background: { type: 'preset', id } });
  };

  const toggleAppLock = async (value: boolean) => {
    if (value && auth === 'none') {
      Alert.alert('アプリロックを使えません', '端末に Face ID・指紋認証・パスコードのいずれかを設定してください。');
      return;
    }
    // オン・オフどちらも本人確認してから切り替える
    if (await authenticate(value ? 'アプリロックを有効にする' : 'アプリロックを無効にする')) {
      updateSettings({ appLock: value });
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="戻る" onPress={() => router.back()} />
        <Text style={styles.title}>設定</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <SectionLabel>背景</SectionLabel>
        <View style={styles.bgGrid}>
          {BACKGROUND_PRESETS.map((p) => {
            const active = bg.type === 'preset' && bg.id === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => choosePreset(p.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`背景 ${p.label}`}
                style={styles.bgItem}
              >
                <View style={[styles.bgThumb, { backgroundColor: p.base, experimental_backgroundImage: p.gradient }, active && styles.bgActive]}>
                  <View style={[styles.miniNote, { backgroundColor: '#FFF3A3', transform: [{ rotate: '-4deg' }] }]} />
                  <View style={[styles.miniNote, { backgroundColor: '#CFE6FF', transform: [{ rotate: '3deg' }], marginTop: 6 }]} />
                </View>
                <Text style={styles.bgLabel}>{p.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={choosePhoto} accessibilityRole="button" accessibilityLabel="写真を背景にする" style={styles.bgItem}>
            <View style={[styles.bgThumb, styles.photoThumb, bg.type === 'photo' && styles.bgActive]}>
              {bg.type === 'photo' ? (
                <Image source={{ uri: bg.uri }} style={StyleSheet.absoluteFill} />
              ) : (
                <Ionicons name="image-outline" size={26} color={ui.subInk} />
              )}
            </View>
            <Text style={styles.bgLabel}>{bg.type === 'photo' ? '写真（変更）' : '写真から選ぶ'}</Text>
          </Pressable>
        </View>
        {bg.type === 'photo' ? (
          <View style={styles.inline}>
            <Text style={styles.inlineLabel}>写真を暗くする</Text>
            <View style={styles.chips}>
              {DIMS.map((d) => (
                <Chip key={d.label} label={d.label} active={bg.dim === d.value} onPress={() => updateSettings({ background: { ...bg, dim: d.value } })} />
              ))}
            </View>
          </View>
        ) : null}

        <SectionLabel>新しい付箋の色</SectionLabel>
        <Card>
          <View style={{ padding: 16 }}>
            <ColorSwatches value={settings.defaultColor} onChange={(defaultColor) => updateSettings({ defaultColor })} size={34} />
          </View>
        </Card>

        <SectionLabel>文字の大きさ</SectionLabel>
        <View style={styles.chips}>
          {FONT_SCALES.map((s) => (
            <Chip key={s.value} label={s.label} active={settings.fontScale === s.value} onPress={() => updateSettings({ fontScale: s.value })} />
          ))}
        </View>

        <SectionLabel>セキュリティ・プライバシー</SectionLabel>
        <Card>
          <SwitchRow
            icon="finger-print"
            label="アプリロック"
            detail={auth === 'none' ? '端末に生体認証/パスコードが未設定です' : auth === 'biometric' ? 'Face ID・指紋認証で開く' : '端末のパスコードで開く'}
            value={settings.appLock}
            onValueChange={toggleAppLock}
          />
          {settings.appLock ? (
            <View style={styles.subBlock}>
              <Text style={styles.inlineLabel}>アプリを離れてからロックするまで</Text>
              <View style={styles.chips}>
                {LOCK_DELAYS.map((d) => (
                  <Chip key={d.value} label={d.label} active={settings.autoLockDelay === d.value} onPress={() => updateSettings({ autoLockDelay: d.value })} />
                ))}
              </View>
            </View>
          ) : null}
          <SwitchRow
            icon="notifications-off-outline"
            label="通知に内容を表示しない"
            detail="リマインダー通知のタイトル・本文を伏せます"
            value={settings.hideNotificationContent}
            onValueChange={(hideNotificationContent) => updateSettings({ hideNotificationContent })}
          />
          <SwitchRow
            icon="eye-off-outline"
            label="スクリーンショットを防止"
            detail={Platform.OS === 'android' ? 'スクリーンショット・録画・履歴画面のプレビューを禁止' : '画面収録・ミラーリング時に内容を隠します'}
            value={settings.preventScreenCapture}
            onValueChange={(preventScreenCapture) => updateSettings({ preventScreenCapture })}
          />
        </Card>

        <SectionLabel>ウィジェット</SectionLabel>
        <Card>
          <Row
            icon="apps-outline"
            label="スロットの使い方"
            detail="付箋を開いて下部の「ウィジェット」からスロット1〜4に貼ると、ホーム画面のウィジェットに表示されます。チェックリストはウィジェット上でチェックできます。"
          />
          {Platform.OS === 'android' ? (
            <Row icon="add-circle-outline" label="ホーム画面にウィジェットを追加" onPress={() => void requestAddWidget()} />
          ) : null}
        </Card>

        <SectionLabel>データ</SectionLabel>
        <Card>
          <Row icon="trash-outline" label="ゴミ箱" detail={`${trashCount} 枚・30日後に自動で完全削除`} onPress={() => router.push('/trash')} />
          <Row
            icon="shield-checkmark-outline"
            label="保存場所：この端末のみ"
            detail="付箋は端末内の暗号化データベース（SQLCipher）に保存され、鍵は Keychain / Keystore で保護されます。クラウド同期・アカウント・解析ツール・外部通信はありません。"
          />
        </Card>

        <Text style={styles.footer}>付箋メモ 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2EFE9' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52 },
  title: { fontSize: 17, fontWeight: '700', color: ui.ink },
  content: { paddingHorizontal: 16 },
  bgGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: '3.5%', rowGap: 14 },
  bgItem: { width: '31%', alignItems: 'center', gap: 6 },
  bgThumb: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    boxShadow: ui.shadow.soft,
  },
  photoThumb: { backgroundColor: ui.surface },
  bgActive: { borderColor: ui.ink },
  miniNote: { width: 34, height: 26, borderRadius: 2, boxShadow: '0px 2px 3px rgba(0,0,0,0.2)' },
  bgLabel: { fontSize: 12.5, fontWeight: '600', color: ui.ink },
  inline: { marginTop: 14, gap: 8 },
  inlineLabel: { fontSize: 13, color: ui.subInk, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subBlock: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  footer: { textAlign: 'center', color: ui.faint, fontSize: 12, marginTop: 28 },
});
