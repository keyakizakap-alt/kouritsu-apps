import { Image, StyleSheet, View } from 'react-native';

import { backgroundPreset } from '../domain/palette';
import type { BackgroundSetting } from '../domain/types';

/** ボード背景（6種のプリセット or 端末内の写真） */
export function Backdrop({ background }: { background: BackgroundSetting }) {
  if (background.type === 'photo') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={{ uri: background.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${background.dim})` }]} />
      </View>
    );
  }
  const preset = backgroundPreset(background.id);
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: preset.base, experimental_backgroundImage: preset.gradient },
      ]}
    >
      {preset.id === 'paper' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              experimental_backgroundImage:
                'linear-gradient(to right, rgba(47,111,235,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(47,111,235,0.10) 1px, transparent 1px)',
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
                'radial-gradient(circle, rgba(90,55,25,0.22) 1px, transparent 1.5px), radial-gradient(circle, rgba(255,235,200,0.18) 1px, transparent 1.5px)',
              experimental_backgroundSize: '9px 9px, 13px 13px',
              experimental_backgroundPosition: '0px 0px, 4px 6px',
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export function headerTone(background: BackgroundSetting): 'light' | 'dark' {
  if (background.type === 'photo') return background.dim >= 0.3 ? 'light' : 'dark';
  return backgroundPreset(background.id).onBackground;
}
