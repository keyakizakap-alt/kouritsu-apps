import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  lineSpacing,
  padding,
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
 * 見やすさ（HIG: Widgets）
 * - 文字はシステムのテキストスタイルで指定し、Dynamic Type に追従させる（最小でも footnote = 13pt）
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

  // ---- ロック画面（Stibo のロック画面ウィジェット相当）。色はシステムが単色化する ----
  if (isAccessory) {
    if (family === 'accessoryInline') {
      const label = !note ? '付箋なし' : note.locked ? 'ロック中の付箋' : note.title || '付箋';
      return <Text modifiers={[widgetURL(url)]}>{label}</Text>;
    }
    if (family === 'accessoryCircular') {
      return (
        <VStack modifiers={[widgetURL(url)]}>
          <Image systemName={note?.locked ? 'lock.fill' : 'note.text'} size={18} />
          {note && note.progress ? <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' })]}>{note.progress}</Text> : null}
        </VStack>
      );
    }
    const lines = !note || note.locked
      ? []
      : note.kind === 'checklist'
        ? note.items.filter((i) => !i.checked).slice(0, 2).map((i) => `・${i.text}`)
        : note.body.split(newline).filter((l) => l.trim() !== '').slice(0, 2);
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(url), frame({ maxWidth: 9999, alignment: 'leading' })]}>
        <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>
          {!note ? '付箋なし' : note.locked ? 'ロック中の付箋' : note.title || '付箋'}
        </Text>
        {lines.map((line, index) => (
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

  if (!note) {
    return (
      <VStack spacing={6} modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url)]}>
        <Image systemName="plus.circle" size={28} color={tone.subInk} />
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(tone.ink)]}>{`スロット${slotNumber}`}</Text>
        <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(tone.subInk)]}>アプリで付箋を貼ってください</Text>
      </VStack>
    );
  }

  if (note.locked) {
    return (
      <VStack spacing={8} modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url)]}>
        <Image systemName="lock.fill" size={26} color={tone.subInk} />
        <Text modifiers={[font({ textStyle: 'headline' }), foregroundStyle(tone.ink)]}>ロック中の付箋</Text>
      </VStack>
    );
  }

  const small = family === 'systemSmall';
  const maxItems = family === 'systemLarge' || family === 'systemExtraLarge' ? 8 : 3;
  const maxBodyLines = small ? 5 : family === 'systemMedium' ? 4 : 12;
  const visibleItems = note.items.slice(0, maxItems);
  const rest = note.items.length - visibleItems.length + note.extraTotal;

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
    <VStack
      alignment="leading"
      spacing={small ? 4 : 6}
      modifiers={[containerBackground(tone.paper, 'widget'), widgetURL(url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}
    >
      <HStack spacing={6}>
        <Text
          modifiers={[
            font({ textStyle: small ? 'subheadline' : 'headline', weight: 'semibold' }),
            foregroundStyle(tone.ink),
            lineLimit(1),
            strikethrough({ isActive: note.done, pattern: 'solid', color: tone.subInk }),
          ]}
        >
          {note.title || '付箋'}
        </Text>
        <Spacer />
        {note.progress ? (
          <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle(tone.subInk)]}>{note.progress}</Text>
        ) : null}
      </HStack>

      {note.kind === 'text' ? (
        <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(tone.ink), lineLimit(maxBodyLines), lineSpacing(3)]}>{note.body}</Text>
      ) : (
        <VStack alignment="leading" spacing={0}>
          {visibleItems.map((item) => (
            <Button key={item.id} target={`toggle|${note.id}|${item.id}`} onPress={() => toggled(item.id)} modifiers={[buttonStyle('plain')]}>
              <HStack spacing={8} modifiers={[frame({ maxWidth: 9999, minHeight: 30, alignment: 'leading' })]}>
                <Image systemName={item.checked ? 'checkmark.square.fill' : 'square'} size={19} color={item.checked ? tone.subInk : tone.ink} />
                <Text
                  modifiers={[
                    font({ textStyle: 'subheadline' }),
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
          {rest > 0 ? (
            <Text modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle(tone.subInk), padding({ top: 2 })]}>{`ほか ${rest} 件`}</Text>
          ) : null}
        </VStack>
      )}
      <Spacer />
    </VStack>
  );
};

export default createWidget<WidgetProps, StickyWidgetConfiguration>('StickyWidget', StickyWidget);
