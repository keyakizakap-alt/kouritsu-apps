import type { BackgroundPresetId, StickyColorId } from './types';

export type ColorScheme = 'light' | 'dark';

export type PaperTone = {
  paper: string;
  /** 付箋上部の糊（のり）帯 */
  band: string;
  /** 本文。紙に対して 7:1 以上 */
  ink: string;
  /** 補足文字（日時・件数・チェック済み）。紙に対して 4.5:1 以上（HIG / WCAG AA） */
  subInk: string;
};

export type StickyColor = {
  id: StickyColorId;
  label: string;
  /** メニュー表示用の SF Symbol 風の絵文字ではなく、色名で区別できるようにする（色覚に依存しない） */
  light: PaperTone;
  dark: PaperTone;
};

/**
 * Stibo の「付箋の色は12種類」に合わせた12色。
 * ダークモードでは紙を沈んだ色にして明るい文字を載せる（反転ではなく、同じ色相の暗い紙）。
 * コントラスト比は tests/palette.test.ts で検証している。
 */
export const STICKY_COLORS: StickyColor[] = [
  {
    id: 'lemon',
    label: 'レモン',
    light: { paper: '#FFF3A3', band: '#FFEE7A', ink: '#393413', subInk: '#6A622B' },
    dark: { paper: '#48431E', band: '#645C26', ink: '#F4F2E6', subInk: '#D1CBA9' },
  },
  {
    id: 'peach',
    label: 'ピーチ',
    light: { paper: '#FFD9B0', band: '#FFC587', ink: '#392713', subInk: '#73532F' },
    dark: { paper: '#48341E', band: '#644626', ink: '#F4EDE6', subInk: '#D1BDA9' },
  },
  {
    id: 'coral',
    label: 'コーラル',
    light: { paper: '#FFC1B6', band: '#FF9E8D', ink: '#391913', subInk: '#7A3E33' },
    dark: { paper: '#48241E', band: '#642F26', ink: '#F4E8E6', subInk: '#D1AFA9' },
  },
  {
    id: 'rose',
    label: 'ローズ',
    light: { paper: '#FFCFE3', band: '#FFA6CB', ink: '#391323', subInk: '#893B5C' },
    dark: { paper: '#481E2F', band: '#642640', ink: '#F4E6EC', subInk: '#D1A9B9' },
  },
  {
    id: 'lavender',
    label: 'ラベンダー',
    light: { paper: '#E3D6FF', band: '#C7ADFF', ink: '#1F1339', subInk: '#5B4096' },
    dark: { paper: '#2B1E48', band: '#3A2664', ink: '#EBE6F4', subInk: '#B5A9D1' },
  },
  {
    id: 'sky',
    label: 'スカイ',
    light: { paper: '#CFE6FF', band: '#A6D1FF', ink: '#132539', subInk: '#385D84' },
    dark: { paper: '#1E3248', band: '#264464', ink: '#E6EDF4', subInk: '#A9BCD1' },
  },
  {
    id: 'aqua',
    label: 'アクア',
    light: { paper: '#C6F1EE', band: '#A4EBE6', ink: '#1B3230', subInk: '#3E6663' },
    dark: { paper: '#26403E', band: '#325855', ink: '#E9F1F1', subInk: '#B1C9C7' },
  },
  {
    id: 'mint',
    label: 'ミント',
    light: { paper: '#D3F5C9', band: '#B6F0A5', ink: '#1F3319', subInk: '#46693B' },
    dark: { paper: '#2B4224', band: '#395A30', ink: '#EAF2E8', subInk: '#B5CAAF' },
  },
  {
    id: 'lime',
    label: 'ライム',
    light: { paper: '#ECF7B0', band: '#E5F688', ink: '#313617', subInk: '#5E6634' },
    dark: { paper: '#3F4422', band: '#565E2C', ink: '#F1F3E7', subInk: '#C8CDAC' },
  },
  {
    id: 'sand',
    label: 'サンド',
    light: { paper: '#EFE2CC', band: '#E7D1AC', ink: '#30291C', subInk: '#665843' },
    dark: { paper: '#3E3628', band: '#554935', ink: '#F1EEE9', subInk: '#C7BFB2' },
  },
  {
    id: 'cloud',
    label: 'クラウド',
    light: { paper: '#F7F7F4', band: '#E6E6DC', ink: '#292923', subInk: '#66665B' },
    dark: { paper: '#363630', band: '#4A4A40', ink: '#EEEEEC', subInk: '#C0C0BA' },
  },
  {
    id: 'graphite',
    label: 'グラファイト',
    light: { paper: '#3A3B40', band: '#2E2F33', ink: '#F4F4F2', subInk: '#C9CACF' },
    dark: { paper: '#27272B', band: '#1D1E20', ink: '#F4F4F2', subInk: '#C9CACF' },
  },
];

const COLOR_MAP = new Map(STICKY_COLORS.map((c) => [c.id, c]));

export function stickyColor(id: StickyColorId): StickyColor {
  return COLOR_MAP.get(id) ?? STICKY_COLORS[0];
}

export function paperTone(id: StickyColorId, scheme: ColorScheme): PaperTone {
  return stickyColor(id)[scheme];
}

export function colorOrder(id: StickyColorId): number {
  return STICKY_COLORS.findIndex((c) => c.id === id);
}

export type BackgroundTone = {
  base: string;
  /** RN の experimental_backgroundImage に渡す CSS グラデーション */
  gradient: string;
  /** 背景の上に直接載る文字（ナビゲーションの大見出しなど）。背景に対して 4.5:1 以上 */
  onBackground: string;
  /** ステータスバー・ナビゲーションの文字を明暗どちらにするか */
  barStyle: 'light' | 'dark';
};

export type BackgroundPreset = {
  id: BackgroundPresetId;
  label: string;
  light: BackgroundTone;
  dark: BackgroundTone;
};

// Stibo の「背景画像6種類」に合わせた6プリセット（画像の代わりにグラデーションで表現）
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'cork',
    label: 'コルク',
    light: {
      base: '#C99D6E',
      gradient: 'radial-gradient(circle at 20% 15%, #D9B285 0%, #C99D6E 45%, #B38660 100%)',
      onBackground: '#1C1C1E',
      barStyle: 'dark',
    },
    dark: {
      base: '#3A2C20',
      gradient: 'radial-gradient(circle at 20% 15%, #4A392A 0%, #3A2C20 50%, #2C2118 100%)',
      onBackground: '#F2F2F7',
      barStyle: 'light',
    },
  },
  {
    id: 'linen',
    label: 'リネン',
    light: { base: '#EDE7DD', gradient: 'linear-gradient(160deg, #F5F0E8 0%, #E7DFD2 100%)', onBackground: '#1C1C1E', barStyle: 'dark' },
    dark: { base: '#22201C', gradient: 'linear-gradient(160deg, #2A2722 0%, #1B1916 100%)', onBackground: '#F2F2F7', barStyle: 'light' },
  },
  {
    id: 'paper',
    label: '方眼紙',
    light: { base: '#FAFAF7', gradient: 'linear-gradient(180deg, #FFFFFF 0%, #F1F1EC 100%)', onBackground: '#1C1C1E', barStyle: 'dark' },
    dark: { base: '#141518', gradient: 'linear-gradient(180deg, #1A1B1F 0%, #111214 100%)', onBackground: '#F2F2F7', barStyle: 'light' },
  },
  {
    id: 'slate',
    label: '黒板',
    light: {
      base: '#2E3A35',
      gradient: 'radial-gradient(circle at 30% 20%, #3C4A44 0%, #2E3A35 55%, #222B27 100%)',
      onBackground: '#F2F2F7',
      barStyle: 'light',
    },
    dark: {
      base: '#18201C',
      gradient: 'radial-gradient(circle at 30% 20%, #212B26 0%, #18201C 55%, #111714 100%)',
      onBackground: '#F2F2F7',
      barStyle: 'light',
    },
  },
  {
    id: 'dusk',
    label: '夕暮れ',
    light: { base: '#3B3F6B', gradient: 'linear-gradient(165deg, #5B5F9A 0%, #3B3F6B 55%, #262947 100%)', onBackground: '#F2F2F7', barStyle: 'light' },
    dark: { base: '#1C1E36', gradient: 'linear-gradient(165deg, #2A2D52 0%, #1C1E36 55%, #121325 100%)', onBackground: '#F2F2F7', barStyle: 'light' },
  },
  {
    id: 'meadow',
    label: '若葉',
    light: { base: '#CFE3C4', gradient: 'linear-gradient(170deg, #E4F0DA 0%, #C3DBB5 100%)', onBackground: '#1C1C1E', barStyle: 'dark' },
    dark: { base: '#1B2617', gradient: 'linear-gradient(170deg, #233120 0%, #141C11 100%)', onBackground: '#F2F2F7', barStyle: 'light' },
  },
];

export function backgroundPreset(id: BackgroundPresetId): BackgroundPreset {
  return BACKGROUND_PRESETS.find((b) => b.id === id) ?? BACKGROUND_PRESETS[0];
}

/** アプリ全体の色（iOS のシステムカラーに準拠し、文字は 4.5:1 以上になるよう濃さを調整） */
export type UiColors = {
  groupedBackground: string;
  surface: string;
  surfaceRaised: string;
  label: string;
  secondaryLabel: string;
  /** プレースホルダー・補助。iOS 標準より濃くして 4.5:1 を確保 */
  tertiaryLabel: string;
  separator: string;
  fill: string;
  accent: string;
  danger: string;
  onAccent: string;
};

export const UI_COLORS: Record<ColorScheme, UiColors> = {
  light: {
    groupedBackground: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    label: '#1C1C1E',
    secondaryLabel: '#5C5C63',
    tertiaryLabel: '#6C6C72',
    separator: 'rgba(60,60,67,0.29)',
    fill: 'rgba(118,118,128,0.12)',
    accent: '#0062D6',
    danger: '#C42B1C',
    onAccent: '#FFFFFF',
  },
  dark: {
    groupedBackground: '#000000',
    surface: '#1C1C1E',
    surfaceRaised: '#2C2C2E',
    label: '#F2F2F7',
    secondaryLabel: '#AEAEB2',
    tertiaryLabel: '#9A9AA0',
    separator: 'rgba(84,84,88,0.65)',
    fill: 'rgba(118,118,128,0.24)',
    accent: '#4DA3FF',
    danger: '#FF6A5F',
    onAccent: '#000000',
  },
};
