#!/usr/bin/env node
// apps/powerbi-viewer の配布物を作る。
// 1. analysis.py を、ブラウザが <script> で読める analysis.py.js に変換する。
//    file:// で開いたページは fetch でローカルファイルを読めないため、Python のソースを JS の文字列として埋め込む。
// 2. index.html・styles.css・app.js・analysis.py.js を 1 つの powerbi-viewer.html にまとめる。
//    このファイルだけを配れば、ダブルクリックで開いて使える。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const VIEWER_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "powerbi-viewer",
);
export const BUNDLE_NAME = "powerbi-viewer.html";

/** analysis.py の内容から analysis.py.js の内容を作る。 */
export function renderPySource(pySource) {
  return [
    "// 自動生成ファイル。編集しない。元: analysis.py / 再生成: npm run build:powerbi-viewer",
    `self.POWERBI_VIEWER_PY = ${JSON.stringify(pySource)};`,
    "",
  ].join("\n");
}

function replaceOnce(text, search, replacement) {
  if (!text.includes(search)) {
    throw new Error(
      `index.html に「${search}」が見つからない。直し方: scripts/build-powerbi-viewer.mjs の置換対象を index.html に合わせる`,
    );
  }
  return text.replace(search, () => replacement);
}

const sha256 = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** 各ファイルの内容から、外部ファイルを参照しない 1 ファイルの HTML を作る。 */
export function renderBundle({ html, css, pyJs, appJs }) {
  for (const [name, code] of [
    ["analysis.py.js", pyJs],
    ["app.js", appJs],
  ]) {
    if (/<\/script/i.test(code)) {
      throw new Error(
        `${name} に "</script" が含まれ、HTML に埋め込めない。直し方: 文字列なら "<\\/script" と書く`,
      );
    }
  }
  const scripts = [pyJs, appJs].map((code) => `\n${code}\n`);
  let out = html;
  // インラインのスクリプトとスタイルはハッシュで許可する（'unsafe-inline' は使わない）
  out = replaceOnce(
    out,
    "script-src 'self'",
    `script-src ${scripts.map(sha256).join(" ")}`,
  );
  const style = `\n${css}`;
  out = replaceOnce(out, "style-src 'self'", `style-src ${sha256(style)}`);
  out = replaceOnce(
    out,
    '<link rel="stylesheet" href="styles.css" />',
    `<style>${style}</style>`,
  );
  out = replaceOnce(
    out,
    '    <script src="analysis.py.js" defer></script>\n',
    "",
  );
  out = replaceOnce(out, '    <script src="app.js" defer></script>\n', "");
  out = replaceOnce(
    out,
    "  </body>",
    `${scripts.map((code) => `    <script>${code}</script>\n`).join("")}  </body>`,
  );
  return out.replace(
    "<!doctype html>\n",
    "<!doctype html>\n<!-- 自動生成ファイル。編集しない。元: apps/powerbi-viewer/ / 再生成: npm run build:powerbi-viewer -->\n",
  );
}

/** apps/powerbi-viewer のソースを読み、生成物の内容を返す。 */
export function renderAll() {
  const read = (name) => readFileSync(join(VIEWER_DIR, name), "utf8");
  const pyJs = renderPySource(read("analysis.py"));
  return {
    "analysis.py.js": pyJs,
    [BUNDLE_NAME]: renderBundle({
      html: read("index.html"),
      css: read("styles.css"),
      pyJs,
      appJs: read("app.js"),
    }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, content] of Object.entries(renderAll())) {
    writeFileSync(join(VIEWER_DIR, name), content);
    console.log(`生成しました: apps/powerbi-viewer/${name}`);
  }
}
