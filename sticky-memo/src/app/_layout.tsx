import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { type, useTheme } from '../components/theme';
import { onReminderOpened } from '../state/reminders';
import { StoreProvider, useStore } from '../state/store';

export default function RootLayout() {
  const theme = useTheme();
  const navTheme = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const sheet = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetAllowedDetents: 'fitToContents' as const,
    sheetCornerRadius: 24,
    headerShown: false,
    contentStyle: { backgroundColor: theme.ui.surface },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...navTheme,
          colors: { ...navTheme.colors, primary: theme.ui.accent, background: theme.ui.groupedBackground, text: theme.ui.label },
        }}
      >
        <StoreProvider>
          <Stack screenOptions={{ headerTintColor: theme.ui.accent, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="note/[id]" />
            <Stack.Screen
              name="settings"
              options={{ title: '設定', headerLargeTitleEnabled: true, headerTransparent: true, headerBlurEffect: 'systemMaterial' }}
            />
            <Stack.Screen
              name="trash"
              options={{ title: 'ゴミ箱', headerLargeTitleEnabled: true, headerTransparent: true, headerBlurEffect: 'systemMaterial' }}
            />
            <Stack.Screen name="color" options={sheet} />
            {/* カレンダーが入るため内容に合わせず、画面の大部分を使う高さで開く */}
            <Stack.Screen name="reminder" options={{ ...sheet, sheetAllowedDetents: [0.92] }} />
            <Stack.Screen name="widget" options={sheet} />
          </Stack>
          <Guards />
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** 読み込み・アプリロック・プライバシー保護を画面の最前面で扱う */
function Guards() {
  const { status, error, appLocked, unlockApp, settings } = useStore();
  const { ui } = useTheme();
  const [inactive, setInactive] = useState(false);

  // アプリ切替画面のスナップショットに中身を映さない
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setInactive(state !== 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const apply = settings.preventScreenCapture
      ? ScreenCapture.preventScreenCaptureAsync('sticky-memo')
      : ScreenCapture.allowScreenCaptureAsync('sticky-memo');
    apply.catch((e) => console.warn('[screen-capture]', e));
  }, [settings.preventScreenCapture]);

  // 通知をタップしたらその付箋を開く
  useEffect(() => onReminderOpened((noteId) => router.push(`/note/${noteId}`)), []);

  // ロックされたら1回だけ自動で認証を促す（認証ダイアログ自体で inactive になるため、キャンセル後に再表示しない）
  const autoPrompted = useRef(false);
  useEffect(() => {
    if (!appLocked) {
      autoPrompted.current = false;
      return;
    }
    if (status === 'ready' && !inactive && !autoPrompted.current) {
      autoPrompted.current = true;
      void unlockApp();
    }
  }, [status, appLocked, inactive, unlockApp]);

  const cover = [StyleSheet.absoluteFill, styles.cover, { backgroundColor: ui.groupedBackground }];

  if (status === 'loading') {
    return (
      <View style={cover}>
        <ActivityIndicator color={ui.secondaryLabel} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={cover}>
        <Icon name="exclamationmark.triangle" size={36} color={ui.danger} />
        <Text style={[type.title3, { color: ui.label }]}>データを開けませんでした</Text>
        <Text style={[type.footnote, { color: ui.secondaryLabel, textAlign: 'center' }]}>{error}</Text>
      </View>
    );
  }

  if (appLocked) {
    return (
      <View style={cover} accessibilityViewIsModal>
        <View style={styles.lockNote}>
          <Icon name="lock.fill" size={30} color="#393413" />
        </View>
        <Text style={[type.title3, { color: ui.label, marginTop: 8 }]}>付箋メモはロックされています</Text>
        <Pressable
          onPress={() => void unlockApp()}
          style={({ pressed }) => [styles.unlock, { backgroundColor: ui.accent }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Icon name="faceid" size={20} color={ui.onAccent} />
          <Text style={[type.headline, { color: ui.onAccent }]}>ロックを解除</Text>
        </Pressable>
      </View>
    );
  }

  if (inactive && (settings.appLock || settings.preventScreenCapture)) {
    return (
      <View style={cover}>
        <View style={styles.lockNote}>
          <Icon name="eye.slash" size={30} color="#393413" />
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  lockNote: {
    width: 84,
    height: 84,
    backgroundColor: '#FFF3A3',
    borderRadius: 6,
    borderBottomRightRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    boxShadow: '0px 6px 16px rgba(40, 30, 10, 0.2)',
  },
  unlock: { marginTop: 16, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 24, minHeight: 50, borderRadius: 25 },
});
