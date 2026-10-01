import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, type TextStyle, useColorScheme, useWindowDimensions } from 'react-native';

import { type ColorScheme, paperTone, UI_COLORS } from '../domain/palette';
import type { StickyColorId } from '../domain/types';

/**
 * iOS の標準テキストスタイル（HIG Typography の Large サイズ）。
 * 日本語は欧文より字面が大きく詰まって見えるため、本文系の行間は 1.5 倍前後にしている。
 * 文字サイズは iOS の「さらに大きな文字」（Dynamic Type）に React Native が自動で追従する。
 */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 27, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 27 },
  callout: { fontSize: 16, lineHeight: 24 },
  subheadline: { fontSize: 15, lineHeight: 22 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption1: { fontSize: 12, lineHeight: 16 },
  // HIG の最小サイズ 11pt。これより小さい文字は使わない
  caption2: { fontSize: 11, lineHeight: 14 },
} satisfies Record<string, TextStyle>;

/**
 * Web プレビュー専用の上余白。iOS では透明なネイティブヘッダーの下に
 * contentInsetAdjustmentBehavior で自動的に余白が入るが、Web にはその仕組みがないため補う。
 */
export const WEB_HEADER_INSET = Platform.OS === 'web' ? 72 : 0;

/** HIG の最小タップ領域 */
export const MIN_TOUCH = 44;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 };

export const shadow = {
  light: {
    card: '0px 1px 2px rgba(40, 30, 10, 0.14), 0px 6px 16px rgba(40, 30, 10, 0.16)',
    raised: '0px 10px 30px rgba(20, 15, 5, 0.22)',
  },
  dark: {
    // ダークモードでは影が見えにくいため、輪郭は紙の明暗差と細い縁で出す
    card: '0px 1px 2px rgba(0, 0, 0, 0.5), 0px 6px 16px rgba(0, 0, 0, 0.45)',
    raised: '0px 10px 30px rgba(0, 0, 0, 0.6)',
  },
};

export type A11yPrefs = {
  /** 設定 > アクセシビリティ > 画面表示とテキストサイズ >「コントラストを上げる」 */
  increaseContrast: boolean;
  /** 「文字を太くする」 */
  boldText: boolean;
  /** 「視差効果を減らす」 */
  reduceMotion: boolean;
};

export function useA11yPrefs(): A11yPrefs {
  const [prefs, setPrefs] = useState<A11yPrefs>({ increaseContrast: false, boldText: false, reduceMotion: false });

  useEffect(() => {
    let alive = true;
    const safe = (p: Promise<boolean> | undefined) => (p ?? Promise.resolve(false)).catch(() => false);
    void Promise.all([
      safe(AccessibilityInfo.isDarkerSystemColorsEnabled?.()),
      safe(AccessibilityInfo.isBoldTextEnabled?.()),
      safe(AccessibilityInfo.isReduceMotionEnabled?.()),
    ]).then(([increaseContrast, boldText, reduceMotion]) => {
      if (alive) setPrefs({ increaseContrast, boldText, reduceMotion });
    });
    const subs = [
      AccessibilityInfo.addEventListener('darkerSystemColorsChanged', (v) => setPrefs((p) => ({ ...p, increaseContrast: v }))),
      AccessibilityInfo.addEventListener('boldTextChanged', (v) => setPrefs((p) => ({ ...p, boldText: v }))),
      AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setPrefs((p) => ({ ...p, reduceMotion: v }))),
    ];
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
    };
  }, []);

  return prefs;
}

export function useTheme() {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { fontScale, width } = useWindowDimensions();
  const a11y = useA11yPrefs();
  const ui = UI_COLORS[scheme];
  return {
    scheme,
    ui,
    a11y,
    /** Dynamic Type の倍率（1 = 標準の「L」） */
    fontScale,
    /** 文字が大きい設定や画面が狭い（拡大表示など）場合は付箋ボードを1列にして、切り詰めを減らす */
    singleColumn: fontScale >= 1.3 || width < 360,
    shadow: shadow[scheme],
    paper: (id: StickyColorId) => {
      const tone = paperTone(id, scheme);
      // 「コントラストを上げる」がオンなら補足文字も本文色にする
      return a11y.increaseContrast ? { ...tone, subInk: tone.ink } : tone;
    },
    /** 「文字を太くする」がオンなら 1 段階太くする */
    weight: (w: TextStyle['fontWeight']): TextStyle['fontWeight'] => {
      if (!a11y.boldText) return w;
      if (w === undefined || w === 'normal' || w === '400') return '600';
      if (w === '500' || w === '600') return '700';
      return '800';
    },
  };
}

export type Theme = ReturnType<typeof useTheme>;

/** 付箋ごとに少しだけ傾けて「貼った紙」らしさを出す（id から決定的に算出、最大 ±1°） */
export function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.5;
}

export function formatReminder(at: number, now = Date.now()): string {
  const d = new Date(at);
  const today = new Date(now);
  const tomorrow = new Date(now + 86400000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay(d, today)) return `今日 ${hm}`;
  if (sameDay(d, tomorrow)) return `明日 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 「10月1日 14:05」形式（同じ年なら年を省く） */
export function formatDateTime(at: number, now = Date.now()): string {
  const d = new Date(at);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${sameYear ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
