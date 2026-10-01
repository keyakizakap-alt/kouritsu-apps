import type { FontScale } from '../domain/types';

export const ui = {
  ink: '#1F1D1A',
  subInk: '#6B665E',
  faint: '#A39D93',
  surface: '#FFFDF9',
  surfaceAlt: '#F4F1EB',
  hairline: 'rgba(31, 29, 26, 0.10)',
  accent: '#2F6FEB',
  danger: '#D6453D',
  radius: { sm: 10, md: 14, lg: 20, xl: 28 },
  space: (n: number) => n * 4,
  shadow: {
    card: '0px 6px 14px rgba(40, 30, 10, 0.18), 0px 1px 2px rgba(40, 30, 10, 0.12)',
    raised: '0px 10px 30px rgba(20, 15, 5, 0.22)',
    soft: '0px 2px 8px rgba(20, 15, 5, 0.10)',
  },
};

export function fontSizes(scale: FontScale) {
  const k = scale === 'small' ? 0.9 : scale === 'large' ? 1.15 : 1;
  return {
    title: Math.round(16 * k),
    body: Math.round(14 * k),
    editorTitle: Math.round(22 * k),
    editorBody: Math.round(17 * k),
    meta: Math.round(11 * k),
  };
}

/** 付箋ごとに少しだけ傾けて「貼った紙」らしさを出す（id から決定的に算出） */
export function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.45;
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
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
