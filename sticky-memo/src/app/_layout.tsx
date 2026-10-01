import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ui } from '../components/theme';
import { onReminderOpened } from '../state/reminders';
import { StoreProvider, useStore } from '../state/store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="note/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="trash" />
        </Stack>
        <Guards />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

/** 読み込み・アプリロック・プライバシー保護を画面の最前面で扱う */
function Guards() {
  const { status, error, appLocked, unlockApp, settings } = useStore();
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

  if (status === 'loading') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.cover]}>
        <ActivityIndicator color={ui.subInk} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.cover]}>
        <Ionicons name="warning-outline" size={36} color={ui.danger} />
        <Text style={styles.coverTitle}>データを開けませんでした</Text>
        <Text style={styles.coverText}>{error}</Text>
      </View>
    );
  }

  if (appLocked) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.cover]}>
        <View style={styles.lockNote}>
          <Ionicons name="lock-closed" size={30} color="#3D3519" />
        </View>
        <Text style={styles.coverTitle}>付箋メモはロックされています</Text>
        <Pressable onPress={() => void unlockApp()} style={styles.unlock} accessibilityRole="button">
          <Ionicons name="finger-print" size={20} color="#fff" />
          <Text style={styles.unlockText}>ロックを解除</Text>
        </Pressable>
      </View>
    );
  }

  if (inactive && (settings.appLock || settings.preventScreenCapture)) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.cover]}>
        <View style={styles.lockNote}>
          <Ionicons name="eye-off-outline" size={30} color="#3D3519" />
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  cover: { backgroundColor: '#F2EFE9', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  coverTitle: { fontSize: 18, fontWeight: '700', color: ui.ink, marginTop: 8 },
  coverText: { fontSize: 13, color: ui.subInk, textAlign: 'center' },
  lockNote: {
    width: 84,
    height: 84,
    backgroundColor: '#FFF3A3',
    borderRadius: 4,
    borderBottomRightRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    boxShadow: ui.shadow.card,
  },
  unlock: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: ui.ink,
    paddingHorizontal: 24,
    height: 50,
    borderRadius: 25,
  },
  unlockText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
