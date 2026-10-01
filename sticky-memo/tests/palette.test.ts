import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BACKGROUND_PRESETS, STICKY_COLORS, UI_COLORS, type ColorScheme } from '../src/domain/palette';

/**
 * Apple HIG（Accessibility > Color and effects）が目安とする WCAG AA のコントラスト比を検証する。
 * 17pt 以下の文字は 4.5:1、18pt 以上・太字は 3:1。本アプリは補足文字も 4.5:1 を下限にしている。
 */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parse(color: string, over?: string): [number, number, number] {
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (rgba) {
    const [r, g, b, a] = rgba.slice(1).map(Number);
    const base = over ? parse(over) : [255, 255, 255];
    return [r, g, b].map((v, i) => a * v + (1 - a) * base[i]) as [number, number, number];
  }
  const hex = color.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(color: string): number {
  const [r, g, b] = parse(color).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const schemes: ColorScheme[] = ['light', 'dark'];

describe('付箋の色（ライト・ダーク）', () => {
  for (const color of STICKY_COLORS) {
    for (const scheme of schemes) {
      const t = color[scheme];
      it(`${color.label}/${scheme}: 本文 7:1 以上・補足 4.5:1 以上`, () => {
        assert.ok(contrast(t.ink, t.paper) >= 7, `ink ${contrast(t.ink, t.paper).toFixed(2)}`);
        assert.ok(contrast(t.subInk, t.paper) >= 4.5, `subInk ${contrast(t.subInk, t.paper).toFixed(2)}`);
        assert.ok(contrast(t.ink, t.band) >= 4.5, `ink on band ${contrast(t.ink, t.band).toFixed(2)}`);
      });
    }
  }
});

describe('アプリ全体の色', () => {
  for (const scheme of schemes) {
    const ui = UI_COLORS[scheme];
    for (const bg of [ui.groupedBackground, ui.surface, ui.surfaceRaised]) {
      it(`${scheme}: ${bg} 上の文字`, () => {
        for (const [name, fg] of Object.entries({
          label: ui.label,
          secondaryLabel: ui.secondaryLabel,
          tertiaryLabel: ui.tertiaryLabel,
          accent: ui.accent,
          danger: ui.danger,
        })) {
          assert.ok(contrast(fg, bg) >= 4.5, `${name} ${contrast(fg, bg).toFixed(2)}`);
        }
      });
    }
    it(`${scheme}: アクセント色ボタン上の文字`, () => {
      assert.ok(contrast(ui.onAccent, ui.accent) >= 4.5);
    });
  }
});

describe('ボード背景の上の見出し', () => {
  for (const preset of BACKGROUND_PRESETS) {
    for (const scheme of schemes) {
      const t = preset[scheme];
      it(`${preset.label}/${scheme}`, () => {
        assert.ok(contrast(t.onBackground, t.base) >= 4.5, contrast(t.onBackground, t.base).toFixed(2));
      });
    }
  }
});
