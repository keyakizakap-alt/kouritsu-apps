#!/usr/bin/env node
// apps/powerbi-viewer が CDN から読み込むファイルの SHA-384 を計算し、ソースに書き込む。
// - app.js の PYODIDE_FILES: Pyodide 本体と、loadPackage で取得する wheel（依存を含む）
// - index.html の ECharts の integrity 属性
// ビューアは、ここに書かれたファイル以外への通信を拒否し、ハッシュが一致しないファイルは実行しない。
// バージョンを上げたら `npm run pin:powerbi-viewer` → `npm run build:powerbi-viewer` → `npm test` の順に実行する。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VIEWER_DIR } from "./build-powerbi-viewer.mjs";

// app.js の loadPackage に渡すパッケージ。依存は pyodide-lock.json からたどる
const PACKAGES = ["numpy", "pandas", "python-calamine"];
const CORE_FILES = [
  "pyodide.js",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];
const START =
  "// <pinned-cdn> 自動生成（npm run pin:powerbi-viewer）。手で編集しない";
const END = "// </pinned-cdn>";

async function download(url) {
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) throw new Error(`${url} を取得できない（HTTP ${res.status}）`);
  return Buffer.from(await res.arrayBuffer());
}

const sri = (bytes) =>
  `sha384-${createHash("sha384").update(bytes).digest("base64")}`;

const appPath = join(VIEWER_DIR, "app.js");
const htmlPath = join(VIEWER_DIR, "index.html");
const app = readFileSync(appPath, "utf8");
const version = app.match(/const PYODIDE_VERSION = "(\d+\.\d+\.\d+)";/)?.[1];
if (!version) throw new Error("app.js に PYODIDE_VERSION がない");
const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

const lockBytes = await download(base + "pyodide-lock.json");
const lock = JSON.parse(lockBytes.toString("utf8"));
const wanted = new Set();
const visit = (name) => {
  const pkg = lock.packages[name];
  if (!pkg) throw new Error(`pyodide-lock.json に ${name} がない`);
  if (wanted.has(name)) return;
  wanted.add(name);
  pkg.depends.forEach(visit);
};
PACKAGES.forEach(visit);

const files = {};
for (const name of CORE_FILES) {
  files[name] =
    name === "pyodide-lock.json"
      ? sri(lockBytes)
      : sri(await download(base + name));
}
for (const name of [...wanted].sort()) {
  const fileName = lock.packages[name].file_name;
  const bytes = await download(base + fileName);
  // lock に書かれた SHA-256 とも照合し、lock と wheel の組み合わせが正しいことを確かめる
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== lock.packages[name].sha256)
    throw new Error(`${fileName} の SHA-256 が pyodide-lock.json と一致しない`);
  files[fileName] = sri(bytes);
}

const block = [
  START,
  "const PYODIDE_FILES = {",
  ...Object.entries(files).map(([k, v]) => `  "${k}": "${v}",`),
  "};",
  END,
].join("\n");
const pattern = new RegExp(
  `${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[/]/g, "\\/")}`,
);
if (!pattern.test(app)) throw new Error("app.js に <pinned-cdn> の区画がない");
writeFileSync(
  appPath,
  app.replace(pattern, () => block),
);

const html = readFileSync(htmlPath, "utf8");
const echartsUrl = html.match(
  /src="(https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[^"]+)"/,
)?.[1];
if (!echartsUrl) throw new Error("index.html に ECharts の script がない");
const echartsSri = sri(await download(echartsUrl));
writeFileSync(
  htmlPath,
  html.replace(
    /(src="https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[^"]+"\s+integrity=")[^"]+"/,
    (_, head) => `${head}${echartsSri}"`,
  ),
);
console.log(
  `Pyodide ${version}: ${Object.keys(files).length} ファイル、ECharts: ${echartsUrl} のハッシュを書き込みました`,
);
