import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * 本番は iPhone 専用（app.json の platforms は ios のみ）。
 * デザイン確認用の Web プレビュー（npm run preview:web）のときだけ web を追加する。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.PREVIEW_WEB !== '1') return base;
  return { ...base, platforms: [...(base.platforms ?? []), 'web'] };
};
