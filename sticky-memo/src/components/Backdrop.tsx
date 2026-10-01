import { Image, StyleSheet, View } from 'react-native';

import { backgroundPreset, type BackgroundTone, type ColorScheme } from '../domain/palette';
import type { BackgroundSetting } from '../domain/types';

export const PHOTO_MIN_DIM = 0.5;

/** ボード背景（6種のプリセット or 端末内の写真）。ダークモードでは暗い版を使う */
export function Backdrop({ background, scheme }: { background: BackgroundSetting; scheme: ColorScheme }) {
  if (background.type === 'photo') {
    // 写真の明るさは予測できないため必ず暗幕をかける。真っ白な写真でも白い大見出し（34pt 太字）が
    // 3:1 以上（HIG の大きな文字の基準）になるよう、最低 50% の黒を重ねる
    const dim = Math.max(background.dim, scheme === 'dark' ? 0.6 : PHOTO_MIN_DIM);
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={{ uri: background.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} />
      </View>
    );
  }
  const preset = backgroundPreset(background.id);
  const tone = preset[scheme];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tone.base, experimental_backgroundImage: tone.gradient }]}>
      {preset.id === 'paper' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              experimental_backgroundImage:
                scheme === 'dark'
                  ? 'linear-gradient(to right, rgba(120,160,255,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,160,255,0.10) 1px, transparent 1px)'
                  : 'linear-gradient(to right, rgba(47,111,235,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(47,111,235,0.10) 1px, transparent 1px)',
              experimental_backgroundSize: '22px 22px',
            },
          ]}
        />
      ) : null}
      {preset.id === 'cork' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              experimental_backgroundImage:
                'radial-gradient(circle, rgba(70,40,15,0.22) 1px, transparent 1.5px), radial-gradient(circle, rgba(255,235,200,0.14) 1px, transparent 1.5px)',
              experimental_backgroundSize: '9px 9px, 13px 13px',
              experimental_backgroundPosition: '0px 0px, 4px 6px',
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** 背景の上に直接載る文字色・ステータスバー */
export function backgroundTone(background: BackgroundSetting, scheme: ColorScheme): BackgroundTone {
  if (background.type === 'photo') {
    return { base: '#000000', gradient: '', onBackground: '#FFFFFF', barStyle: 'light' };
  }
  return backgroundPreset(background.id)[scheme];
}
