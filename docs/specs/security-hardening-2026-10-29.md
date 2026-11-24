# セキュリティ強化（Power BI データビューアとバックエンド、2026-10-29）

- ステータス: 完了
- 関連: ブランチ `claude/powerbi-file-viewer`（PR #9）

## 目的

ブラウザで動く Power BI データビューアと、Next.js のバックエンド（API）について、監査で見つかった脆弱性と抜け漏れを修正する。修正ごとに、攻撃が通らないことを自動テストで確かめる。

## 見つかった問題と対応

| # | 対象 | 問題 | 対応 |
| --- | --- | --- | --- |
| 1 | ビューア | `pyodide.js` 以外（wasm・標準ライブラリ・lock・wheel）はハッシュ未検証で、CDN が改ざんされると任意コードが動く | 全 12 ファイルの SHA-384 を固定（`npm run pin:powerbi-viewer`）。Worker は一覧外の URL を拒否し、準備後は通信を止める |
| 2 | ビューア | CSP が CDN 全体を許可し、`style-src 'unsafe-inline'` もあった | `script-src` は ECharts の 1 ファイル、`connect-src` は Pyodide の配布フォルダだけ。インラインはハッシュで許可 |
| 3 | ビューア | ツールチップが HTML 描画で、エスケープ漏れが XSS になる構造だった | キャンバス描画（richText）に変更し、Trusted Types を強制 |
| 4 | ビューア | CSV 書き出しで `-2+3+cmd|…` のように数字で始まる式が無害化されなかった | 数値そのもの以外は `= + - @` タブ・改行で始まれば `'` を付ける |
| 5 | ビューア | PNG 書き出しが CSP（`connect-src`）で失敗していた | data: URL を fetch せずにバイト列へ戻す |
| 6 | ビューア | zip 爆弾・巨大な期間・大きすぎる件数指定でブラウザが固まる | 展開前の zip 検査、セル数・期間数・件数の上限 |
| 7 | ビューア | 改ざん検知時に分かりにくいエラー、wasm 改ざん時は無応答 | 検証失敗を即座に検出して原因を表示。3 分で打ち切る |
| 8 | API | `X-Forwarded-For` を常に信頼し、偽装でレート制限を回避できた | Vercel か `TRUSTED_PROXY_IP_HEADER` 設定時だけ使う |
| 9 | API | `request.formData()` が本文を上限なしで読み、chunked 送信でメモリを使い切れた | 上限つきで読んでから解析 |
| 10 | API | DOCX / XLSX の zip 爆弾、OCR の同時実行が無制限 | 展開前に中央ディレクトリを検査、同時 2 件まで |
| 11 | API | 質問生成で、検証していない `context` の項目が外部 AI にそのまま送られた | 検証した 3 項目だけを送る |
| 12 | API | IPv6 の内部アドレス（`[::1]`・`[::ffff:…]`・`fc00::/7`）を SSRF 判定で見逃した。AI の応答サイズが無制限 | 判定を `isPrivateHost` に集約、応答は 1MB まで |
| 13 | ページ | CSP が `script-src 'unsafe-inline'` | `proxy.ts` でリクエストごとの nonce と `'strict-dynamic'` |
| 14 | API | Origin を内部 URL と比べていたため `127.0.0.1` で開くと API が失敗した。直すと DNS リバインディングの余地が出る | Host と比較し、Host を許可リスト（`ALLOWED_HOSTS`）で制限。`same-site` も拒否 |
| 15 | CI | Python 依存をハッシュなしで取得、CodeQL が Python を解析していない | `--require-hashes --only-binary=:all:`、CodeQL に python を追加 |

## スコープ

- やること: 上の表の修正と、その回帰テスト
- やらないこと: 依存パッケージの版上げ（`npm audit` は 0 件。next 16.4.3 はバグ修正のみで公開から 2 週間未満）

## 残存リスク

- zip の検査は中央ディレクトリの記録を使う。記録を偽った zip は、展開ライブラリ側の挙動に依存する（Python 側は WebAssembly のメモリ上限、API 側はリクエストの時間上限で止まる）。
- Trusted Types は Chromium 系・Safari・Firefox の最近の版で有効。未対応のブラウザでは、textContent と richText による防御だけになる。
- ビューアを Web サーバーで公開する場合、`frame-ancestors` は meta タグで指定できないため、HTTP ヘッダーで付ける必要がある（README に記載）。

## 完了条件

- [x] `npm test` が終了コード0で終わる
- [x] `npm run lint:specs` が終了コード0で終わる
- [x] `npx tsc --noEmit` が終了コード0で終わる
- [x] `npm run build` が終了コード0で終わる
- [x] `npm run smoke` の出力に `PASS: nonce CSP, chunked oversize abort, X-Forwarded-For spoofing does not bypass rate limit` を含む
- [x] `npm audit --audit-level=high` が終了コード0で終わる
- [x] `lib/security.ts` の `clientAddress` / `isPrivateHost` と `apps/powerbi-viewer/app.js` の `csvCell` を修正前の実装に戻すと、`npm test` が終了コード1で終わる
- [x] Playwright で `apps/powerbi-viewer/index.html` を開き、`pandas` の wheel または `pyodide.asm.wasm` を 1 バイト書き換えて返すと、10 秒以内に `#engine` の `data-state` が `error` になる
- [x] Playwright で `apps/powerbi-viewer/powerbi-viewer.html` を `file://` で開き、サンプルデータの7タブ表示でコンソールのエラー・警告が0件
