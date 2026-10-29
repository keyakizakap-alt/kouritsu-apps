#!/usr/bin/env node
// apps/powerbi-viewer/analysis.py を、ブラウザが <script> で読める analysis.py.js に変換する。
// file:// で開いたページは fetch でローカルファイルを読めないため、Python のソースを JS の文字列として埋め込む。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const VIEWER_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "powerbi-viewer",
);

/** analysis.py の内容から analysis.py.js の内容を作る。 */
export function renderPySource(pySource) {
  return [
    "// 自動生成ファイル。編集しない。元: analysis.py / 再生成: npm run build:powerbi-viewer",
    `self.POWERBI_VIEWER_PY = ${JSON.stringify(pySource)};`,
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(VIEWER_DIR, "analysis.py.js");
  writeFileSync(
    out,
    renderPySource(readFileSync(join(VIEWER_DIR, "analysis.py"), "utf8")),
  );
  console.log(`生成しました: ${out}`);
}
