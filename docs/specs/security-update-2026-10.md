# 依存パッケージの最新化とセキュリティ修正（2026-10）

- ステータス: 完了
- 関連: ブランチ `claude/security-update-2026-10`

## 目的

Next.js の critical 脆弱性（next/og の RCE ほか）を含む既知の脆弱性を解消し、依存パッケージを最新版にそろえる。

## スコープ

- やること: next / react / sharp / mammoth / unpdf / read-excel-file / tailwindcss / typescript ほかの最新化、AI 接続先へのリダイレクト追従の禁止
- やらないこと: 画面や抽出ロジックの変更

## 残存リスク

- `sprintf-js`（moderate, GHSA-hp3w-g68c-fv3c）は修正版が公開されていない。`mammoth` の CLI 用依存（`argparse`）経由でのみ入り、アプリが読み込む `mammoth/lib` からは参照されない。

## Node.js ランタイム（2026-10-21 セキュリティリリース）

Node.js 公式が 2026-10-21 に High 4件を含む10件の脆弱性を修正した（修正版: 22.23.4 / 24.22.1 / 26.12.1）。修正版より古い Node.js で開発・CI・デプロイが動かないよう、`package.json` の `engines.node` で下限を指定する。ローカル実行（ZIP 配布）を考慮し、保守中の LTS である 22 系の修正版も許可する。`.npmrc` の `engine-strict=true` により、古い版では `npm ci` が失敗する。

## 完了条件

- [x] `npm test` が終了コード0で終わる
- [x] `npm run lint:specs` が終了コード0で終わる
- [x] `npx tsc --noEmit` が終了コード0で終わる
- [x] `npx next build` が終了コード0で終わる
- [x] `npm run smoke` の出力に `PASS:` を含む
- [x] `npm audit --audit-level=high` が終了コード0で終わる
- [x] `npm ls next` の出力に `next@16.4.2` を含む
- [x] `lib/server.ts` の AI 呼び出しに `redirect: "error"` を含む
- [x] `package.json` の `engines.node` が `^22.23.4 || ^24.22.1` である
- [x] `.npmrc` に `engine-strict=true` を含む
- [x] Node.js 24.22.1 で `npm ci`・`npm test`・`npm run smoke` が終了コード0で終わる
