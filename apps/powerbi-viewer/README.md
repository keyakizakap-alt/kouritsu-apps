# Power BI データビューア

Power BI からエクスポートした CSV / Excel を、**ブラウザだけで**集計・可視化する静的アプリです。インストールもサーバーも不要です。解析は Python（pandas）が WebAssembly（Pyodide）上でブラウザ内で実行し、**ファイルの中身は外部に送信しません**。

## 使い方

**配るのは `powerbi-viewer.html` の 1 ファイルだけで使えます。** CSS・JavaScript・Python をすべて埋め込んであるので、メールや共有フォルダで渡して、ダブルクリックで開けます。

1. Power BI でビジュアル右上の「…（その他のオプション）」→「データのエクスポート」を選び、.xlsx か .csv で保存します。
2. `powerbi-viewer.html`（または `index.html`）をブラウザ（Chrome / Edge / Firefox / Safari の最新版）で開きます。
3. ファイルをドロップ（またはクリックして選択）します。「架空のサンプルデータで試す」で操作を確認できます。

初回はライブラリを CDN（cdn.jsdelivr.net）から取得するため、インターネット接続が必要です（Python の準備に約10秒。2回目以降はブラウザのキャッシュで速くなります）。

社内サーバーで配る場合は、このフォルダをそのまま任意の Web サーバーに置くだけです（例: `python3 -m http.server`）。

## できること

| タブ | 内容 |
| --- | --- |
| 概要 | 自動インサイト（最大構成比・前月比・ピーク・強い相関・空白の多い列）、列ごとの型・空白率・一意数・要約 |
| 集計 | カテゴリ別の合計 / 平均 / 中央値 / 最小 / 最大 / 件数 / 個別件数。上位 N 件＋「その他」 |
| 時系列 | 日・週・月・四半期・年ごとの推移。内訳（上位5件＋その他）で系列を分割 |
| 分布 | ヒストグラムと要約統計（平均・標準偏差・四分位） |
| 相関 | 数値列どうしのピアソン相関ヒートマップ |
| クロス集計 | 行 × 列のピボット（ヒートマップ / 表） |
| データ | 全列検索・並べ替え・ページ送り、フィルター後の全行を CSV で書き出し |

- 左のフィルター（カテゴリの選択、数値の範囲、日付の期間）はすべてのタブに反映されます。
- 各グラフは「表」に切り替えて数値を確認でき、CSV と PNG で書き出せます。
- ライト / ダーク表示、スマートフォン幅に対応しています。

### 読み込みで自動処理すること

- 文字コード: BOM 付き UTF-8（Power BI の CSV）、Shift_JIS（CP932）、UTF-16 を判定
- 区切り文字: カンマ・タブ・セミコロン・パイプを判定
- Excel: データの最も多いシートを選択（シートは画面で切替可）
- Power BI の Excel エクスポートの **1行目「Applied filters: …」** を見出しと区別して画面に注記として表示し、**末尾の「Exported data exceeded the allowed volume…」** があれば「上限に達し一部省略」の警告を出します（[Microsoft Learn: Export data from a Power BI visualization](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-export-data)）
- 数値: `1,200` `¥1,000` `12%`（→0.12）`(300)`（→-300）、全角数字
- 日付: `2025-01-31` `2025/1/31` `2025年1月31日`、Excel の日付セル。区切りのない `2024` は数値として扱います

## 制限

- Power BI のエクスポート上限は .csv が 3万行、.xlsx が 15万行です（ビジュアルや管理者設定でさらに小さくなる場合あり）。このアプリ自体は 200MB までのファイルを受け付けますが、数十万行を超えるとブラウザのメモリ次第で遅くなります。
- 型推定は値の95%以上が変換できるかで判定します。表記が混在する列はカテゴリやテキストになります。
- 自動インサイトは集計値から機械的に作る文で、原因の推測はしません。相関は因果を示しません。
- 解析ライブラリは CDN から取得します。CDN に接続できない環境では動きません（完全オフライン化するには Pyodide と ECharts を同じフォルダに置き、`app.js` の `PYODIDE_URL`、`index.html` の `<script src>` と CSP の `script-src` / `connect-src` を書き換えてください）。
- 悪意のある・壊れたファイルでブラウザが固まらないよう、Excel の展開後サイズ 512MB・3,000 万セル・時系列 5,000 区間を上限にしています。

## 構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面の骨組み。CSP で通信先と実行できるスクリプトを限定 |
| `styles.css` | デザイントークン（ライト / ダーク）とレイアウト |
| `app.js` | 画面・フィルター・グラフ（Apache ECharts）。Pyodide を Web Worker で起動 |
| `analysis.py` | 解析エンジン（pandas）。読み込み・型推定・集計・インサイト |
| `analysis.py.js` | `analysis.py` を `<script>` で読める形にした自動生成ファイル（`file://` 対応のため） |
| `powerbi-viewer.html` | 上のファイルをすべて埋め込んだ 1 ファイル版（自動生成）。インラインスクリプトは CSP のハッシュで許可 |
| `tests/test_analysis.py` | 解析エンジンの単体テスト |

### 技術選定

- **Pyodide 314.0.7**（Python 3.14 / pandas 3.0.2 / python-calamine 0.6.2 を同梱）: Python をブラウザ内で動かし、pandas の集計をそのまま使うため。Excel は Rust 製で高速な calamine エンジンで読みます。
- **Apache ECharts 6.1.0**: 依存なしの 1 ファイルで、ヒートマップ・ズーム・PNG 出力まで揃うため。
- **Web Worker**: 大きなファイルの集計中も画面が固まらないようにするため。Worker は Blob から起動し、`file://` でも動きます。

### セキュリティ

外部に出るのは CDN からのライブラリ取得だけで、読み込んだファイルの中身はどこにも送りません。次の層で守っています。

| 対策 | 内容 |
| --- | --- |
| 通信先の制限（CSP） | `default-src 'none'`。通信は Pyodide の配布フォルダ（`cdn.jsdelivr.net/pyodide/v314.0.7/full/`）だけ、スクリプトは ECharts の 1 ファイルと自前のものだけ。`'unsafe-inline'` / `'unsafe-eval'` は使いません（WebAssembly 用の `'wasm-unsafe-eval'` のみ）。1 ファイル版のインラインスクリプト・スタイルは SHA-256 で個別に許可 |
| 改ざん検知（SRI） | CDN から取る全 13 ファイル（ECharts と、Pyodide 本体・標準ライブラリ・pandas などの wheel）の SHA-384 をソースに固定。Worker は一覧にない URL への通信を拒否し、ハッシュが合わないファイルは実行しません。Python の準備が終わると Worker の通信を止めます |
| Trusted Types | `require-trusted-types-for 'script'` で、文字列を HTML・スクリプトとして扱う API を禁止。許可するのは、自分で作った blob: URL と、ECharts が要素を空にする `innerHTML = ""` だけです |
| 表示 | 読み込んだ値は `textContent` だけで DOM に入れ、グラフのツールチップも HTML ではなくキャンバスに描きます |
| CSV 書き出し | `=` `+` `-` `@` タブ・改行で始まる文字列（`-2+3+cmd|…` のように数字で始まる式を含む）に `'` を付け、Excel での数式実行を防ぎます。数値そのものは変えません |
| 資源の上限 | zip 爆弾（展開後 512MB・圧縮率 500 倍）、セル数、期間数、集計件数に上限を設け、ブラウザのメモリを使い切らせません |

Web サーバーに置いて公開する場合は、meta タグでは指定できない `frame-ancestors 'none'`（他サイトへの埋め込み防止）と `X-Content-Type-Options: nosniff` を、HTTP ヘッダーで付けてください。

## 開発

```sh
# ソースを変更したら（analysis.py.js と powerbi-viewer.html を再生成。忘れると npm test が失敗する）
npm run build:powerbi-viewer

# Python のテスト（ブラウザ内と同じ版を、ハッシュ検証つきで入れる）
python3 -m pip install --require-hashes --only-binary=:all: -r apps/powerbi-viewer/requirements-dev.txt
python3 -m unittest discover -s apps/powerbi-viewer/tests -v

# リポジトリ全体のテスト（上の Python テストも含む）
npm test
```

### ライブラリの更新手順

1. 新しい版を決め、次の 3 か所をそろえて書き換えます。
   - `app.js` の `PYODIDE_VERSION`
   - `index.html` の CSP の `connect-src`（`…/pyodide/v<版>/full/`）
   - `index.html` の ECharts の `<script src>` と、CSP の `script-src` にある同じ URL
2. CDN の全ファイルのハッシュを計算して書き込み、生成物を作り直します。

   ```sh
   npm run pin:powerbi-viewer
   npm run build:powerbi-viewer
   ```

   `pin:powerbi-viewer` は wheel の SHA-256 を `pyodide-lock.json` とも照合し、一致しなければ止まります。
3. Pyodide 同梱の版（`pyodide-lock.json` の numpy / pandas / python-calamine / python-dateutil / six）に合わせて `requirements-dev.txt` の版を変え、PyPI のハッシュを付け直します（`pip-compile --generate-hashes` など）。
4. `npm test` を実行します。
