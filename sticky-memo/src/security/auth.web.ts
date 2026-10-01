export type AuthAvailability = 'biometric' | 'passcode' | 'none';

// Web プレビューでは端末認証が無いため、ロック解除は常に成功扱い（プレビュー専用）
export async function authAvailability(): Promise<AuthAvailability> {
  return 'biometric';
}

export async function authenticate(_reason: string): Promise<boolean> {
  return true;
}
