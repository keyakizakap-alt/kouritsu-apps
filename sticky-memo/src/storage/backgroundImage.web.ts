// Web プレビューでは写真背景を扱わない
export async function pickBackgroundPhoto(): Promise<string | null> {
  return null;
}
export function deleteBackgroundPhoto(_uri: string | null | undefined): void {}
