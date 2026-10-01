import type { BackgroundPresetId, StickyColorId } from './types';

export type StickyColor = {
  id: StickyColorId;
  label: string;
  paper: string;
  /** 付箋上部の糊（のり）帯 */
  band: string;
  ink: string;
  subInk: string;
};

// Stibo の「付箋の色は12種類」に合わせた12色
export const STICKY_COLORS: StickyColor[] = [
  { id: 'lemon', label: 'レモン', paper: '#FFF3A3', band: '#F6E37A', ink: '#3D3519', subInk: '#7A6C35' },
  { id: 'peach', label: 'ピーチ', paper: '#FFD9B0', band: '#F8C48E', ink: '#43301B', subInk: '#86643F' },
  { id: 'coral', label: 'コーラル', paper: '#FFC1B6', band: '#F6A597', ink: '#4A2420', subInk: '#8C4F47' },
  { id: 'rose', label: 'ローズ', paper: '#FFCFE3', band: '#F5B3D0', ink: '#4A2236', subInk: '#8B5170' },
  { id: 'lavender', label: 'ラベンダー', paper: '#E3D6FF', band: '#CDBBF7', ink: '#2F2650', subInk: '#625590' },
  { id: 'sky', label: 'スカイ', paper: '#CFE6FF', band: '#B0D3FA', ink: '#1C3150', subInk: '#4D6A90' },
  { id: 'aqua', label: 'アクア', paper: '#C6F1EE', band: '#A2E2DD', ink: '#163F3C', subInk: '#457C77' },
  { id: 'mint', label: 'ミント', paper: '#D3F5C9', band: '#B7E8A9', ink: '#1F3E19', subInk: '#507A47' },
  { id: 'lime', label: 'ライム', paper: '#ECF7B0', band: '#DCEB88', ink: '#36401A', subInk: '#6C7A3B' },
  { id: 'sand', label: 'サンド', paper: '#EFE2CC', band: '#E1CFAF', ink: '#3E3424', subInk: '#7B6A4F' },
  { id: 'cloud', label: 'クラウド', paper: '#F7F7F4', band: '#E6E6E0', ink: '#2B2B28', subInk: '#6F6F68' },
  { id: 'graphite', label: 'グラファイト', paper: '#3A3B40', band: '#2D2E33', ink: '#F4F4F2', subInk: '#B5B6BC' },
];

const COLOR_MAP = new Map(STICKY_COLORS.map((c) => [c.id, c]));

export function stickyColor(id: StickyColorId): StickyColor {
  return COLOR_MAP.get(id) ?? STICKY_COLORS[0];
}

export function colorOrder(id: StickyColorId): number {
  return STICKY_COLORS.findIndex((c) => c.id === id);
}

export type BackgroundPreset = {
  id: BackgroundPresetId;
  label: string;
  base: string;
  /** RN の experimental_backgroundImage に渡す CSS グラデーション */
  gradient: string;
  /** 背景上のヘッダー文字色 */
  onBackground: 'light' | 'dark';
};

// Stibo の「背景画像6種類」に合わせた6プリセット（画像の代わりにグラデーションで表現）
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'cork',
    label: 'コルク',
    base: '#C79A6B',
    gradient: 'radial-gradient(circle at 20% 15%, #D8AE7F 0%, #C79A6B 45%, #B0835A 100%)',
    onBackground: 'dark',
  },
  {
    id: 'linen',
    label: 'リネン',
    base: '#EDE7DD',
    gradient: 'linear-gradient(160deg, #F5F0E8 0%, #E7DFD2 100%)',
    onBackground: 'dark',
  },
  {
    id: 'paper',
    label: '方眼紙',
    base: '#FAFAF7',
    gradient: 'linear-gradient(180deg, #FFFFFF 0%, #F1F1EC 100%)',
    onBackground: 'dark',
  },
  {
    id: 'slate',
    label: '黒板',
    base: '#2E3A35',
    gradient: 'radial-gradient(circle at 30% 20%, #3C4A44 0%, #2E3A35 55%, #222B27 100%)',
    onBackground: 'light',
  },
  {
    id: 'dusk',
    label: '夕暮れ',
    base: '#3B3F6B',
    gradient: 'linear-gradient(165deg, #5B5F9A 0%, #3B3F6B 55%, #262947 100%)',
    onBackground: 'light',
  },
  {
    id: 'meadow',
    label: '若葉',
    base: '#CFE3C4',
    gradient: 'linear-gradient(170deg, #E4F0DA 0%, #C3DBB5 100%)',
    onBackground: 'dark',
  },
];

export function backgroundPreset(id: BackgroundPresetId): BackgroundPreset {
  return BACKGROUND_PRESETS.find((b) => b.id === id) ?? BACKGROUND_PRESETS[0];
}
