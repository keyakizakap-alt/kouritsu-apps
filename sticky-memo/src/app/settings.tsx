import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../components/Icon';
import { Cell, Section, Segmented, SwitchCell } from '../components/ios';
import { radius, type, useTheme, WEB_HEADER_INSET } from '../components/theme';
import { selectTrash } from '../domain/notes';
import { BACKGROUND_PRESETS, stickyColor } from '../domain/palette';
import type { AutoLockDelay } from '../domain/types';
import { authAvailability, authenticate, type AuthAvailability } from '../security/auth';
import { useStore } from '../state/store';
import { deleteBackgroundPhoto, pickBackgroundPhoto } from '../storage/backgroundImage';

const LOCK_DELAYS: { value: AutoLockDelay; label: string }[] = [
  { value: 0, label: 'すぐ' },
  { value: 60, label: '1分' },
  { value: 300, label: '5分' },
  { value: 900, label: '15分' },
];

// 「設定」アプリにならい、項目ごとに色付きのアイコンを付けて見分けやすくする
const TILE = {
  appearance: '#5E5CE6',
  color: '#E3A21A',
  lock: '#34A853',
  notify: '#E5484D',
  eye: '#8E8E93',
  widget: '#0A84FF',
  trash: '#8E8E93',
  shield: '#30A46C',
  text: '#0A84FF',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, updateSettings, notes } = useStore();
  const [auth, setAuth] = useState<AuthAvailability>('none');
  const trashCount = selectTrash(notes).length;
  const bg = settings.background;

  useEffect(() => {
    void authAvailability().then(setAuth);
  }, []);

  const choosePhoto = async () => {
    try {
      const uri = await pickBackgroundPhoto();
      if (!uri) return;
      if (bg.type === 'photo') deleteBackgroundPhoto(bg.uri);
      updateSettings({ background: { type: 'photo', uri, dim: 0.5 } });
    } catch {
      Alert.alert('写真を読み込めませんでした', '「設定」アプリ > 付箋メモ > 写真 でアクセスを許可しているか確認してください。');
    }
  };

  const choosePreset = (id: (typeof BACKGROUND_PRESETS)[number]['id']) => {
    if (bg.type === 'photo') deleteBackgroundPhoto(bg.uri);
    updateSettings({ background: { type: 'preset', id } });
  };

  const toggleAppLock = async (value: boolean) => {
    if (value && auth === 'none') {
      Alert.alert('アプリロックを使えません', '「設定」アプリで Face ID またはパスコードを設定してください。');
      return;
    }
    // オン・オフどちらも本人確認してから切り替える
    if (await authenticate(value ? 'アプリロックを有効にする' : 'アプリロックを無効にする')) {
      updateSettings({ appLock: value });
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.ui.groupedBackground }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 48, paddingTop: WEB_HEADER_INSET }}
    >
      <Section header="ボードの背景" footer="背景を写真にした場合も、文字が読みやすいよう自動で暗くします。">
        <View style={styles.bgGrid}>
          {BACKGROUND_PRESETS.map((p) => {
            const active = bg.type === 'preset' && bg.id === p.id;
            const tone = p[theme.scheme];
            return (
              <Pressable
                key={p.id}
                onPress={() => choosePreset(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`背景 ${p.label}`}
                style={styles.bgItem}
              >
                <View
                  style={[
                    styles.bgThumb,
                    { backgroundColor: tone.base, experimental_backgroundImage: tone.gradient, borderColor: active ? theme.ui.accent : theme.ui.separator, borderWidth: active ? 3 : 1 },
                  ]}
                >
                  <View style={[styles.miniNote, { backgroundColor: theme.paper('lemon').paper, transform: [{ rotate: '-4deg' }] }]} />
                  <View style={[styles.miniNote, { backgroundColor: theme.paper('sky').paper, transform: [{ rotate: '3deg' }], marginTop: 6 }]} />
                </View>
                <Text style={[type.footnote, { color: active ? theme.ui.label : theme.ui.secondaryLabel, fontWeight: active ? '700' : '400' }]}>{p.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => void choosePhoto()} accessibilityRole="button" accessibilityLabel="写真を背景にする" style={styles.bgItem}>
            <View
              style={[
                styles.bgThumb,
                { backgroundColor: theme.ui.fill, borderColor: bg.type === 'photo' ? theme.ui.accent : theme.ui.separator, borderWidth: bg.type === 'photo' ? 3 : 1 },
              ]}
            >
              {bg.type === 'photo' ? <Image source={{ uri: bg.uri }} style={StyleSheet.absoluteFill} /> : <Icon name="photo" size={26} color={theme.ui.secondaryLabel} />}
            </View>
            <Text style={[type.footnote, { color: theme.ui.secondaryLabel }]}>{bg.type === 'photo' ? '写真を変更' : '写真'}</Text>
          </Pressable>
        </View>
        {bg.type === 'photo' ? (
          <View style={styles.inline}>
            <Text style={[type.subheadline, { color: theme.ui.secondaryLabel }]}>写真の暗さ</Text>
            <Segmented
              options={[
                { value: 0.5, label: '標準' },
                { value: 0.65, label: '暗め' },
                { value: 0.8, label: 'かなり暗め' },
              ]}
              value={bg.dim >= 0.8 ? 0.8 : bg.dim >= 0.65 ? 0.65 : 0.5}
              onChange={(dim) => updateSettings({ background: { ...bg, dim } })}
            />
          </View>
        ) : null}
      </Section>

      <Section footer="文字の大きさは iPhone の「設定」> 画面表示と明るさ > テキストサイズ に合わせて変わります。外観（ライト／ダーク）も iPhone の設定に従います。">
        <Cell
          icon="paintpalette"
          iconColor={TILE.color}
          title="新しい付箋の色"
          value={stickyColor(settings.defaultColor).label}
          onPress={() => router.push({ pathname: '/color', params: { id: 'default' } })}
        />
        <Cell icon="textformat.size" iconColor={TILE.text} title="文字の大きさ" value="iPhone の設定" last />
      </Section>

      <Section header="セキュリティとプライバシー">
        <SwitchCell
          icon="faceid"
          iconColor={TILE.lock}
          title="アプリロック"
          detail={auth === 'none' ? 'Face ID・パスコードが未設定です' : auth === 'biometric' ? 'Face ID / Touch ID で開きます' : 'iPhone のパスコードで開きます'}
          value={settings.appLock}
          onValueChange={(v) => void toggleAppLock(v)}
        />
        {settings.appLock ? (
          <View style={[styles.inline, styles.inlineInCell, { borderBottomColor: theme.ui.separator }]}>
            <Text style={[type.subheadline, { color: theme.ui.secondaryLabel }]}>アプリを離れてからロックするまで</Text>
            <Segmented options={LOCK_DELAYS} value={settings.autoLockDelay} onChange={(autoLockDelay) => updateSettings({ autoLockDelay })} />
          </View>
        ) : null}
        <SwitchCell
          icon="bell.slash"
          iconColor={TILE.notify}
          title="通知に内容を表示しない"
          detail="リマインダー通知のタイトルと本文を伏せます"
          value={settings.hideNotificationContent}
          onValueChange={(hideNotificationContent) => updateSettings({ hideNotificationContent })}
        />
        <SwitchCell
          icon="eye.slash"
          iconColor={TILE.eye}
          title="画面収録で内容を隠す"
          detail="画面収録・ミラーリング中は内容を表示しません"
          value={settings.preventScreenCapture}
          onValueChange={(preventScreenCapture) => updateSettings({ preventScreenCapture })}
          last
        />
      </Section>

      <Section
        header="ウィジェット"
        footer="付箋の下部にある「ウィジェット」ボタンからスロット1〜4に貼ると、ホーム画面・ロック画面のウィジェットに表示されます。チェックリストはウィジェット上でチェックできます。"
      >
        <Cell icon="widget.small" iconColor={TILE.widget} title="ウィジェットの追加方法" detail="ホーム画面を長押し →「編集」→「ウィジェットを追加」" multilineDetail last />
      </Section>

      <Section header="データ">
        <Cell icon="trash" iconColor={TILE.trash} title="ゴミ箱" value={`${trashCount}`} onPress={() => router.push('/trash')} />
        <Cell
          icon="lock.shield"
          iconColor={TILE.shield}
          title="この iPhone にだけ保存"
          detail="付箋は端末内の暗号化データベースに保存され、鍵はキーチェーンで保護されます。アカウント・クラウド同期・外部への通信はありません。"
          multilineDetail
          last
        />
      </Section>

      <Text style={[type.footnote, styles.version, { color: theme.ui.secondaryLabel }]}>付箋メモ 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bgGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, rowGap: 14 },
  bgItem: { width: '25%', alignItems: 'center', gap: 6 },
  bgThumb: { width: 64, height: 80, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  miniNote: { width: 30, height: 22, borderRadius: 2, boxShadow: '0px 2px 3px rgba(0,0,0,0.2)' },
  inline: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  inlineInCell: { paddingLeft: 60, borderBottomWidth: StyleSheet.hairlineWidth },
  version: { textAlign: 'center', marginTop: 28 },
});
