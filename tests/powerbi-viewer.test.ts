// Power BI データビューア（apps/powerbi-viewer）のテスト。
// ブラウザだけで動く静的アプリなので、ここでは「配布物の整合性」と「Python 解析エンジンの単体テスト」を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VIEWER_DIR,
  renderPySource,
} from "../scripts/build-powerbi-viewer.mjs";

const read = (name: string) => readFileSync(join(VIEWER_DIR, name), "utf8");
const python = process.env.PYTHON || "python3";

test("analysis.py.js が analysis.py から生成した最新の内容になっている", () => {
  assert.equal(
    read("analysis.py.js"),
    renderPySource(read("analysis.py")),
    "analysis.py を変更したのに analysis.py.js が古い。直し方: npm run build:powerbi-viewer を実行してコミットする",
  );
});

test("CDN のスクリプトはバージョン固定かつ改ざん検知つきで読み込む", () => {
  const html = read("index.html");
  const app = read("app.js");
  const scripts = [
    ...html.matchAll(/<script\s[^>]*src="(https:[^"]+)"[^>]*>/g),
  ];
  assert.ok(scripts.length > 0, "CDN のスクリプトが見つからない");
  for (const [tag, src] of scripts) {
    assert.match(
      src,
      /@\d+\.\d+\.\d+\//,
      `${src} のバージョンが固定されていない。直し方: パッケージ名@x.y.z の形で指定する`,
    );
    assert.match(
      tag,
      /integrity="sha384-[A-Za-z0-9+/=]+"/,
      `${src} に integrity がない。直し方: README の手順で SHA-384 を計算して integrity 属性に書く`,
    );
  }
  assert.match(
    app,
    /PYODIDE_VERSION = "\d+\.\d+\.\d+"/,
    "Pyodide のバージョンが固定されていない。直し方: app.js の PYODIDE_VERSION に x.y.z を書く",
  );
  assert.match(
    app,
    /PYODIDE_INTEGRITY = "sha384-[A-Za-z0-9+/=]{64}"/,
    "pyodide.js のハッシュがない。直し方: README の手順で SHA-384 を計算して PYODIDE_INTEGRITY に書く",
  );
});

test("ページは外部への送信先を CDN だけに制限している", () => {
  const html = read("index.html");
  const csp = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )?.[1];
  assert.ok(
    csp,
    "CSP の meta タグがない。直し方: index.html の <head> に Content-Security-Policy を戻す",
  );
  assert.match(csp, /default-src 'none'/, "default-src が 'none' でない");
  assert.match(
    csp,
    /connect-src https:\/\/cdn\.jsdelivr\.net;/,
    "connect-src に CDN 以外が含まれている。直し方: ファイルの中身を送れる送信先を増やさない",
  );
  assert.doesNotMatch(
    csp,
    /'unsafe-eval'/,
    "script-src に 'unsafe-eval' がある。直し方: Pyodide に必要なのは 'wasm-unsafe-eval' だけ",
  );
});

test("読み込んだデータを HTML として解釈する API を使っていない", () => {
  const app = read("app.js");
  for (const pattern of [
    /\.innerHTML\s*=/,
    /\.outerHTML\s*=/,
    /insertAdjacentHTML/,
    /document\.write/,
    /\beval\(/,
    /new Function\(/,
  ]) {
    assert.doesNotMatch(
      app,
      pattern,
      `app.js に ${pattern} がある。ファイル内の文字列で HTML やスクリプトが実行されうる。直し方: h() と textContent を使う`,
    );
  }
});

test("Python 解析エンジンの単体テストが通る", (t) => {
  const probe = spawnSync(
    python,
    ["-c", "import pandas, python_calamine, openpyxl"],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) {
    const message = `${python} に pandas / python-calamine / openpyxl がない。直し方: python3 -m pip install -r apps/powerbi-viewer/requirements-dev.txt（別の Python を使うときは環境変数 PYTHON にパスを指定）`;
    // CI では必ず実行する。手元では依存がなければ理由を表示して飛ばす
    if (process.env.CI) assert.fail(message);
    t.skip(message);
    return;
  }
  const run = spawnSync(
    python,
    ["-m", "unittest", "discover", "-s", join(VIEWER_DIR, "tests")],
    { encoding: "utf8" },
  );
  assert.equal(
    run.status,
    0,
    `Python のテストが失敗した。直し方: 下の出力の「直し方」に従って apps/powerbi-viewer/analysis.py を直す\n${run.stderr}${run.stdout}`,
  );
});
