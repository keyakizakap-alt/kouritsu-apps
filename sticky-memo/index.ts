import 'expo-router/entry';

import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widgets/android/widgetTaskHandler';

// Android のホーム画面ウィジェットはアプリ未起動時もヘッドレス JS でこのハンドラーを呼ぶ
if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}
