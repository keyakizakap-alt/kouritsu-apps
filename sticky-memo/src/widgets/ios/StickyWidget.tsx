import { Button, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  lineSpacing,
  minimumScaleFactor,
  strikethrough,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetProps } from '../../domain/widgetSnapshot';

export type StickyWidgetConfiguration = { slot: string };

/**
 * iOS ホーム画面 / ロック画面の付箋ウィジェット。
 * 'widget' ディレクティブ付きの関数は独立ランタイムで動くため、
 * 定数・ヘルパーはすべて関数内に置く（モジュールスコープは参照できない）。
 * また文字列化の際にバックスラッシュのエスケープ（'\n' など）が失われるため使わない。
 *
 * 表示内容（手本：StickyNote）
 * - ホーム画面ではメモの中身だけを紙いっぱいに表示する（タイトル行・件数・補足は出さない）
 * - タップするとそのメモの編集画面が開く
 *
 * 見やすさ（HIG: Widgets）
 * - 文字はシステムのテキストスタイルで指定し、Dynamic Type に追従させる（本文は callout / body = 16〜17pt）
 * - 余白はシステム標準（16pt）のまま
 * - チェック行は 30pt 以上の高さを取り、押し間違いを減らす
 * - iPhone の外観に合わせてライト／ダークの紙色を切り替える
 */
const StickyWidget = (props: WidgetProps, environment: WidgetEnvironment<StickyWidgetConfiguration>) => {
  'widget';
  // 設定値は Swift の識別子である必要があるため 'slot1'〜'slot4'
  const slotNumber = Math.min(4, Math.max(1, Number(String(environment.configuration?.slot ?? 'slot1').replace('slot', '')) || 1));
  const note = props?.slots?.[slotNumber - 1] ?? null;
  const family = environment.widgetFamily;
  const newline = String.fromCharCode(10);
  const url = note ? `stickymemo://note/${note.id}` : 'stickymemo://';
  const isAccessory = family === 'accessoryRectangular' || family === 'accessoryInline' || family === 'accessoryCircular';

  // メモ本文の行（ロック画面用）。チェックリストは未完了の項目を並べる
  const memoLines = !note || note.locked
    ? []
    : note.kind === 'checklist'
      ? note.items.filter((i) => !i.checked).map((i) => `・${i.text}`)
      : note.text.split(newline).filter((l) => l.trim() !== '');

  // ---- ロック画面。メモの中身だけを出す（色はシステムが単色化する） ----
  if (isAccessory) {
    if (family === 'accessoryInline') {
      const label = !note ? 'メモなし' : note.locked ? 'ロック中' : memoLines[0] ?? '';
      return <Text modifiers={[widgetURL(url)]}>{label}</Text>;
    }
    if (family === 'accessoryCircular') {
      return (
        <VStack modifiers={[widgetURL(url)]}>
          <Image systemName={note?.locked ? 'lock.fill' : 'note.text'} size={20} />
        </VStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
        {note && note.locked ? <Image systemName="lock.fill" size={16} /> : null}
        {!note ? <Text modifiers={[font({ textStyle: 'subheadline' })]}>メモなし</Text> : null}
        {memoLines.slice(0, 3).map((line, index) => (
          <Text key={`l${index}`} modifiers={[font({ textStyle: 'subheadline' }), lineLimit(1)]}>
            {line}
          </Text>
        ))}
      </VStack>
    );
  }

  // ---- ホーム画面 ----
  const dark = environment.colorScheme === 'dark';
  const tone = note ? (dark ? note.dark : note.light) : dark
    ? { paper: '#48431E', band: '#645C26', ink: '#F4F2E6', subInk: '#D1CBA9' }
    : { paper: '#FFF3A3', band: '#FFEE7A', ink: '#393413', subInk: '#6A622B' };
  // メモだけを紙いっぱいに表示する（タイトル行・件数・補足は出さない）
  const fill = frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' });

  if (!note) {
    return (
      <VStack spacing={6} modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url)]}>
        <Image systemName="plus.circle" size={28} color={tone.subInk} />
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(tone.ink)]}>{`スロット${slotNumber}`}</Text>
        <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(tone.subInk)]}>アプリでメモを貼ってください</Text>
      </VStack>
    );
  }

  // ロック中は中身を出さず、鍵だけを表示する
  if (note.locked) {
    return (
      <VStack modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url)]}>
        <Image systemName="lock.fill" size={28} color={tone.subInk} />
      </VStack>
    );
  }

  const small = family === 'systemSmall';

  if (note.kind === 'text') {
    return (
      <VStack alignment="leading" modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url), fill]}>
        <Text
          modifiers={[
            font({ textStyle: small ? 'callout' : 'body' }),
            foregroundStyle(tone.ink),
            lineSpacing(4),
            // 少し長いメモも収まるよう、必要なら 85% まで縮小する
            minimumScaleFactor(0.85),
          ]}
        >
          {note.text}
        </Text>
      </VStack>
    );
  }

  const maxItems = family === 'systemLarge' || family === 'systemExtraLarge' ? 10 : 4;
  const visibleItems = note.items.slice(0, maxItems);

  // ボタンを押したときの新しい props（アプリが起動していなくてもウィジェットがその場で更新される）
  const toggled = (itemId: string): WidgetProps => ({
    ...props,
    slots: props.slots.map((wn) => {
      if (!wn || wn.id !== note.id) return wn;
      const items = wn.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i));
      const doneCount = items.filter((i) => i.checked).length + wn.extraDone;
      const total = items.length + wn.extraTotal;
      return { ...wn, items, done: total > 0 && doneCount === total, progress: `${doneCount}/${total}`, edited: true };
    }),
  });

  return (
    <VStack alignment="leading" spacing={0} modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url), fill]}>
      {visibleItems.map((item) => (
        <Button key={item.id} target={`toggle|${note.id}|${item.id}`} onPress={() => toggled(item.id)} modifiers={[buttonStyle('plain')]}>
          <HStack spacing={8} modifiers={[frame({ maxWidth: 9999, minHeight: 30, alignment: 'leading' })]}>
            <Image systemName={item.checked ? 'checkmark.square.fill' : 'square'} size={19} color={item.checked ? tone.subInk : tone.ink} />
            <Text
              modifiers={[
                font({ textStyle: small ? 'callout' : 'body' }),
                foregroundStyle(item.checked ? tone.subInk : tone.ink),
                lineLimit(1),
                strikethrough({ isActive: item.checked, pattern: 'solid', color: tone.subInk }),
              ]}
            >
              {item.text}
            </Text>
          </HStack>
        </Button>
      ))}
    </VStack>
  );
};

export default createWidget<WidgetProps, StickyWidgetConfiguration>('StickyWidget', StickyWidget);
