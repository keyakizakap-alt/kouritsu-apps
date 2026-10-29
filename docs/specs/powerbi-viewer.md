# Power BI データビューア

- ステータス: 完了
- 関連: `apps/powerbi-viewer/`

## 目的

Power BI の「データのエクスポート」で出した CSV / Excel を、インストールもサーバーも使わずにブラウザだけで集計・可視化する。ファイルの中身は外部へ送らない。

## スコープ

- やること: CSV（UTF-8 / Shift_JIS / UTF-16、カンマ・タブ等）と Excel（.xlsx / .xls / .xlsb / .ods）の読み込み、列の型推定、フィルター、カテゴリ別集計、時系列、分布、相関、クロス集計、データ一覧、自動インサイト、CSV / PNG 書き出し、ライト / ダーク表示、スマートフォン幅
- やること: Power BI の Excel エクスポートに付く「Applied filters」注記行と「Exported data exceeded…」上限超過行の除去・表示
- やらないこと: Power BI への直接接続（REST API・XMLA）、.pbix の読み込み、データの保存・共有、オフライン（CDN なし）配布

## 完了条件

- [x] `npm test` が終了コード0で終わる
- [x] `python3 -m unittest discover -s apps/powerbi-viewer/tests` が終了コード0で終わる（`apps/powerbi-viewer/requirements-dev.txt` を入れた環境）
- [x] `apps/powerbi-viewer/analysis.py.js` が `npm run build:powerbi-viewer` の出力と一致する（`tests/powerbi-viewer.test.ts` で検査）
- [x] `apps/powerbi-viewer/index.html` を `file://` と `http://` の両方で開き、Chromium でサンプルデータの7タブを表示したときにコンソールのエラー・警告が0件（Playwright で確認）
- [x] `apps/powerbi-viewer/app.js` に `innerHTML` / `eval(` / `new Function(` が含まれない（`tests/powerbi-viewer.test.ts` で検査）
- [x] 幅390pxで `document.documentElement.scrollWidth` が画面幅を超えない（Playwright で確認）
