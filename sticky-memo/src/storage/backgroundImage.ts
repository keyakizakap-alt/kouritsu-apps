import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/**
 * 背景写真はフォトライブラリから選んだものをアプリのサンドボックス内にコピーして使う
 * （元写真を参照し続けない・外部へ送信しない）。
 */
const dir = () => new Directory(Paths.document, 'backgrounds');

export async function pickBackgroundPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const folder = dir();
  if (!folder.exists) folder.create({ idempotent: true, intermediates: true });
  const source = new File(result.assets[0].uri);
  const ext = (source.extension || '.jpg').toLowerCase();
  const target = new File(folder, `bg-${Crypto.randomUUID()}${ext}`);
  source.copySync(target);
  return target.uri;
}

export function deleteBackgroundPhoto(uri: string | null | undefined): void {
  if (!uri || !uri.includes('/backgrounds/')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 既に無い場合は無視
  }
}
