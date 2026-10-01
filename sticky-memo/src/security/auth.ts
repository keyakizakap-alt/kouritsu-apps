import * as LocalAuthentication from 'expo-local-authentication';

export type AuthAvailability = 'biometric' | 'passcode' | 'none';

export async function authAvailability(): Promise<AuthAvailability> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return 'none';
  if (level === LocalAuthentication.SecurityLevel.SECRET) return 'passcode';
  return 'biometric';
}

/**
 * Face ID / 指紋 / 端末パスコードで本人確認する。
 * アプリ独自のパスワードは保存しない（端末の認証基盤に任せる）。
 */
export async function authenticate(reason: string): Promise<boolean> {
  if ((await authAvailability()) === 'none') return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'キャンセル',
    disableDeviceFallback: false,
  });
  return result.success;
}
