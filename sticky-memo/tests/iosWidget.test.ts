import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

import { createNote } from '../src/domain/notes';
import type { Note } from '../src/domain/types';
import { buildWidgetProps, type WidgetProps } from '../src/domain/widgetSnapshot';

/**
 * iOS ウィジェットは 'widget' ディレクティブで文字列化され、拡張機能内の独立ランタイムで評価される。
 * ここでは Expo の Babel 設定で実際に文字列化し、@expo/ui のグローバルをスタブした VM で評価して
 * 「関数外の値を参照していないか」「表示内容」「ボタン押下で props が更新されるか」を確認する。
 */
const require = createRequire(__filename);
const root = path.resolve(__dirname, '..');
const babel = require(require.resolve('@babel/core', { paths: [require.resolve('expo/package.json', { paths: [root] })] }));

type Node = { type: string; props: Record<string, any> };

function serializedWidget(): string {
  const file = path.join(root, 'src/widgets/ios/StickyWidget.tsx');
  const { code } = babel.transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    cwd: root,
    babelrc: false,
    configFile: false,
    presets: [require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json', { paths: [root] })] })],
    caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false },
  });
  // `const StickyWidget = () => { 'widget'; ... }` は `var StickyWidget = \`function(...){...}\`` に置き換わる
  const match = /StickyWidget\s*=\s*(`(?:[^`\\]|\\.)*`)/.exec(code);
  assert.ok(match, 'ウィジェット関数が文字列化されていること');
  return vm.runInNewContext(match[1]);
}

function runtime() {
  const flat = (children: unknown): unknown[] =>
    (Array.isArray(children) ? children.flat(Infinity) : [children]).filter((c) => c !== null && c !== undefined && c !== false);
  const jsx = (type: unknown, props: Record<string, any>) => {
    if (typeof type === 'function') return type(props);
    return { type, props: { ...props, children: props.children === undefined ? [] : flat(props.children) } };
  };
  const components = ['VStack', 'HStack', 'ZStack', 'Text', 'Image', 'Button', 'Spacer'];
  const modifiers = ['buttonStyle', 'containerBackground', 'font', 'foregroundStyle', 'frame', 'lineLimit', 'lineSpacing', 'opacity', 'padding', 'strikethrough', 'widgetURL'];
  const globals: Record<string, unknown> = { _jsx: jsx, _jsxs: jsx, Fragment: 'Fragment', _Fragment: 'Fragment' };
  for (const name of components) globals[name] = name;
  for (const name of modifiers) globals[name] = (...args: unknown[]) => ({ modifier: name, args });
  return vm.createContext(globals);
}

const source = serializedWidget();
const context = runtime();
const widget = vm.runInContext(`(${source})`, context) as (props: WidgetProps, env: object) => Node;

function texts(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (!node || typeof node !== 'object') return [];
  const n = node as Node;
  return (n.props.children ?? []).flatMap(texts);
}

function find(node: unknown, pred: (n: Node) => boolean): Node[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as Node;
  return [...(pred(n) ? [n] : []), ...(n.props?.children ?? []).flatMap((c: unknown) => find(c, pred))];
}

const env = (family: string, slot = 'slot1', colorScheme: 'light' | 'dark' = 'light') => ({ widgetFamily: family, date: new Date(0), configuration: { slot }, colorScheme });

let seq = 0;
const id = () => `n${++seq}`;
function listNote(patch: Partial<Note> = {}): Note {
  return {
    ...createNote('checklist', 'mint', 1, id),
    title: '今日のタスク',
    items: [
      { id: 'a', text: '資料を送る', checked: false },
      { id: 'b', text: '会議の予約', checked: true },
    ],
    widgetSlot: 1,
    ...patch,
  };
}

describe('iOS ウィジェット（文字列化された関数）', () => {
  it('モジュールスコープの値に依存せず評価できる', () => {
    assert.doesNotThrow(() => widget(buildWidgetProps([], 0), env('systemSmall')));
  });

  it('空きスロットは案内を表示', () => {
    const tree = widget(buildWidgetProps([], 0), env('systemMedium', 'slot3'));
    assert.ok(texts(tree).includes('スロット3'));
  });

  it('チェックリストを表示し、ボタンで props が更新される', () => {
    const props = buildWidgetProps([listNote()], 0);
    const tree = widget(props, env('systemLarge'));
    assert.ok(texts(tree).includes('今日のタスク'));
    assert.ok(texts(tree).includes('資料を送る'));
    const buttons = find(tree, (n) => n.type === 'Button');
    assert.equal(buttons.length, 2);
    // ボタンの target は一意（ランタイムは target でボタンを特定する）
    assert.equal(new Set(buttons.map((b) => b.props.target)).size, 2);
    const next = buttons[0].props.onPress() as WidgetProps;
    assert.equal(next.slots[0]?.items[0].checked, true);
    assert.equal(next.slots[0]?.done, true);
    assert.equal(next.slots[0]?.edited, true);
    // 更新後の props で再描画できる
    assert.doesNotThrow(() => widget(next, env('systemLarge')));
  });

  it('ロック中は中身を出さない', () => {
    const props = buildWidgetProps([listNote({ locked: true })], 0);
    const tree = widget(props, env('systemMedium'));
    assert.ok(texts(tree).includes('ロック中の付箋'));
    assert.ok(!texts(tree).includes('資料を送る'));
  });

  it('ロック画面（長方形・インライン・円形）でも描画できる', () => {
    const props = buildWidgetProps([listNote()], 0);
    assert.ok(texts(widget(props, env('accessoryRectangular'))).includes('今日のタスク'));
    assert.ok(texts(widget(props, env('accessoryInline'))).includes('今日のタスク'));
    assert.ok(texts(widget(props, env('accessoryCircular'))).includes('1/2'));
  });

  it('iPhone の外観に合わせて紙の色を切り替える', () => {
    const props = buildWidgetProps([listNote()], 0);
    const bg = (tree: Node) => tree.props.modifiers.find((m: { modifier: string }) => m.modifier === 'containerBackground').args[0];
    assert.equal(bg(widget(props, env('systemMedium', 'slot1', 'light'))), props.slots[0]?.light.paper);
    assert.equal(bg(widget(props, env('systemMedium', 'slot1', 'dark'))), props.slots[0]?.dark.paper);
  });

  it('11pt 未満の固定サイズ文字を使わない（テキストスタイルで指定）', () => {
    const tree = widget(buildWidgetProps([listNote()], 0), env('systemSmall'));
    const fonts = find(tree, () => true).flatMap((n) => (n.props.modifiers ?? []).filter((m: { modifier: string }) => m.modifier === 'font'));
    assert.ok(fonts.length > 0);
    for (const f of fonts) {
      const p = f.args[0];
      assert.ok(p.textStyle || p.size >= 11, JSON.stringify(p));
    }
  });

  it('スロット設定で別の付箋を表示', () => {
    const other = listNote({ title: '買い物', widgetSlot: 2 });
    const tree = widget(buildWidgetProps([listNote(), other], 0), env('systemSmall', 'slot2'));
    assert.ok(texts(tree).includes('買い物'));
  });
});
