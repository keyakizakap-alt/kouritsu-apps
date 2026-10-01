import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  opacity,
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
 * 長押し →「ウィジェットを編集」でスロット(1〜4)を選ぶと、アプリでそのスロットに貼った付箋が表示される。
 */
const StickyWidget = (props: WidgetProps, environment: WidgetEnvironment<StickyWidgetConfiguration>) => {
  'widget';
  // 設定値は Swift の識別子である必要があるため 'slot1'〜'slot4'
  const slotNumber = Math.min(4, Math.max(1, Number(String(environment.configuration?.slot ?? 'slot1').replace('slot', '')) || 1));
  const note = props?.slots?.[slotNumber - 1] ?? null;
  const family = environment.widgetFamily;
  // 文字列化の際にバックスラッシュのエスケープが失われるため、改行は文字コードで表す
  const newline = String.fromCharCode(10);
  const isAccessory = family === 'accessoryRectangular' || family === 'accessoryInline' || family === 'accessoryCircular';

  // ---- ロック画面（Stibo のロック画面ウィジェット相当）----
  if (isAccessory) {
    if (family === 'accessoryInline') {
      const label = !note ? '付箋なし' : note.locked ? 'ロック中の付箋' : note.title || '付箋';
      return <Text modifiers={[widgetURL(note ? `stickymemo://note/${note.id}` : 'stickymemo://')]}>{label}</Text>;
    }
    if (family === 'accessoryCircular') {
      return (
        <VStack modifiers={[widgetURL(note ? `stickymemo://note/${note.id}` : 'stickymemo://')]}>
          <Image systemName={note?.locked ? 'lock.fill' : 'note.text'} size={18} />
          {note && note.progress ? <Text modifiers={[font({ size: 11, weight: 'semibold' })]}>{note.progress}</Text> : null}
        </VStack>
      );
    }
    const lines = !note
      ? []
      : note.kind === 'checklist'
        ? note.items.filter((i) => !i.checked).slice(0, 2).map((i) => `・${i.text}`)
        : note.body.split(newline).filter((l) => l.trim() !== '').slice(0, 2);
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(note ? `stickymemo://note/${note.id}` : 'stickymemo://'), frame({ maxWidth: 9999, alignment: 'leading' })]}>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1)]}>
          {!note ? '付箋なし' : note.locked ? 'ロック中' : note.title || '付箋'}
        </Text>
        {lines.map((line, index) => (
          <Text key={`l${index}`} modifiers={[font({ size: 12 }), lineLimit(1)]}>
            {line}
          </Text>
        ))}
      </VStack>
    );
  }

  // ---- ホーム画面 ----
  const paper = note?.paper ?? '#FFF3A3';
  const ink = note?.ink ?? '#3D3519';
  const subInk = note?.subInk ?? '#7A6C35';

  if (!note) {
    return (
      <VStack spacing={6} modifiers={[containerBackground(paper, 'widget'), widgetURL('stickymemo://')]}>
        <Image systemName="plus.circle" size={26} color={subInk} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(ink)]}>{`スロット${slotNumber}`}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(subInk)]}>アプリで付箋を貼ってください</Text>
      </VStack>
    );
  }

  if (note.locked) {
    return (
      <VStack spacing={6} modifiers={[containerBackground(paper, 'widget'), widgetURL(`stickymemo://note/${note.id}`)]}>
        <Image systemName="lock.fill" size={24} color={subInk} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(ink)]}>ロック中の付箋</Text>
      </VStack>
    );
  }

  const maxItems = family === 'systemSmall' ? 4 : family === 'systemMedium' ? 4 : 10;
  const maxBodyLines = family === 'systemSmall' ? 5 : family === 'systemMedium' ? 4 : 14;
  const titleSize = family === 'systemSmall' ? 14 : 16;
  const itemSize = family === 'systemSmall' ? 12 : 14;
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
      spacing={family === 'systemSmall' ? 4 : 6}
      modifiers={[
        containerBackground(paper, 'widget'),
        widgetURL(`stickymemo://note/${note.id}`),
        frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' }),
      ]}
    >
      <HStack spacing={4}>
        {note.title ? (
          <Text
            modifiers={[
              font({ size: titleSize, weight: 'bold', design: 'rounded' }),
              foregroundStyle(ink),
              lineLimit(1),
              strikethrough({ isActive: note.done, pattern: 'solid', color: subInk }),
            ]}
          >
            {note.title}
          </Text>
        ) : null}
        <Spacer />
        {note.progress ? (
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(subInk)]}>{note.progress}</Text>
        ) : null}
      </HStack>

      {note.kind === 'text' ? (
        <Text modifiers={[font({ size: itemSize }), foregroundStyle(ink), lineLimit(maxBodyLines)]}>{note.body}</Text>
      ) : (
        <VStack alignment="leading" spacing={family === 'systemSmall' ? 2 : 4}>
          {visibleItems.map((item) => (
            <Button
              key={item.id}
              target={`toggle|${note.id}|${item.id}`}
              onPress={() => toggled(item.id)}
              modifiers={[buttonStyle('plain')]}
            >
              <HStack spacing={6}>
                <Image systemName={item.checked ? 'checkmark.square.fill' : 'square'} size={itemSize + 2} color={item.checked ? subInk : ink} />
                <Text
                  modifiers={[
                    font({ size: itemSize }),
                    foregroundStyle(item.checked ? subInk : ink),
                    lineLimit(1),
                    strikethrough({ isActive: item.checked, pattern: 'solid', color: subInk }),
                    opacity(item.checked ? 0.75 : 1),
                  ]}
                >
                  {item.text}
                </Text>
              </HStack>
            </Button>
          ))}
          {rest > 0 ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle(subInk), padding({ top: 2 })]}>{`ほか ${rest} 件`}</Text>
          ) : null}
        </VStack>
      )}
      <Spacer />
    </VStack>
  );
};

export default createWidget<WidgetProps, StickyWidgetConfiguration>('StickyWidget', StickyWidget);
