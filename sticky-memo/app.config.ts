import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json を土台に、本番ビルド（EAS の production プロファイル）だけ
 * Android のインターネット権限を外す。アプリは通信を一切行わないため、OS レベルで通信不可にする。
 * 開発ビルドは Metro との通信が必要なので外さない。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const production = process.env.EAS_BUILD_PROFILE === 'production' || process.env.APP_VARIANT === 'production';
  const base = config as ExpoConfig;
  if (!production) return base;
  return {
    ...base,
    android: {
      ...base.android,
      blockedPermissions: [...(base.android?.blockedPermissions ?? []), 'android.permission.INTERNET'],
    },
  };
};
