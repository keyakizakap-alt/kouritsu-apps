// Power BI データビューア（apps/powerbi-viewer）のテスト。
// ブラウザだけで動く静的アプリなので、ここでは「配布物の整合性」と「Python 解析エンジンの単体テスト」を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import {
  BUNDLE_NAME,
  VIEWER_DIR,
  renderAll,
} from "../scripts/build-powerbi-viewer.mjs";

const read = (name: string) => readFileSync(join(VIEWER_DIR, name), "utf8");
const python = process.env.PYTHON || "python3";

test("生成ファイル（analysis.py.js と 1 ファイル版 HTML）が最新の内容になっている", () => {
  for (const [name, expected] of Object.entries(renderAll())) {
    assert.equal(
      read(name),
      expected,
      `apps/powerbi-viewer/${name} が元のファイルより古い。直し方: npm run build:powerbi-viewer を実行してコミットする`,
    );
  }
});

test("1 ファイル版 HTML は CDN 以外のファイルを参照しない", () => {
  const html = read(BUNDLE_NAME);
  const refs = [...html.matchAll(/\s(?:src|href)="([^"#]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !/^(https:\/\/cdn\.jsdelivr\.net\/|data:)/.test(url));
  assert.deepEqual(
    refs,
    [],
    "1 ファイル版がローカルのファイルを参照している。直し方: scripts/build-powerbi-viewer.mjs の renderBundle で埋め込む",
  );
  const scriptSrc = html.match(/script-src ([^;]+);/)?.[1] ?? "";
  assert.match(
    scriptSrc,
    /'sha256-/,
    "インラインスクリプトのハッシュが CSP にない。直し方: npm run build:powerbi-viewer を実行する",
  );
  assert.doesNotMatch(
    scriptSrc,
    /'unsafe-inline'/,
    "script-src に 'unsafe-inline' がある。直し方: インラインスクリプトはハッシュで許可する",
  );
});

/** app.js を DOM なしで読み込み、関数を取り出す（画面の起動処理は DOMContentLoaded まで走らない）。 */
function loadAppFunctions() {
  const context: Record<string, unknown> = {
    self: {},
    document: { documentElement: { dataset: {} }, addEventListener() {} },
    localStorage: {
      getItem: () => null,
      setItem() {},
    },
    URL,
    Blob,
    Intl,
  };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(
    `${read("app.js")}\n;globalThis.__exports = { toCsv, PYODIDE_FILES, PYODIDE_PACKAGES };`,
    context,
  );
  return context.__exports as {
    toCsv: (header: unknown[], rows: unknown[][]) => string;
    PYODIDE_FILES: Record<string, string>;
    PYODIDE_PACKAGES: string[];
  };
}

function csp(name: string) {
  const html = read(name);
  const value = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )?.[1];
  assert.ok(
    value,
    `${name} に CSP の meta タグがない。直し方: <head> に Content-Security-Policy を戻す`,
  );
  return Object.fromEntries(
    value
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([k, ...v]) => [k, v]),
  ) as Record<string, string[]>;
}

test("CDN のファイルはすべて版を固定し、SHA-384 で検証してから使う", () => {
  const html = read("index.html");
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
      /integrity="sha384-[A-Za-z0-9+/=]{64}"/,
      `${src} に integrity がない。直し方: npm run pin:powerbi-viewer を実行する`,
    );
  }
  const { PYODIDE_FILES, PYODIDE_PACKAGES } = loadAppFunctions();
  for (const core of [
    "pyodide.js",
    "pyodide.asm.mjs",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
  ]) {
    assert.match(
      PYODIDE_FILES[core] ?? "",
      /^sha384-[A-Za-z0-9+/=]{64}$/,
      `${core} のハッシュが PYODIDE_FILES にない。直し方: npm run pin:powerbi-viewer を実行する`,
    );
  }
  for (const name of PYODIDE_PACKAGES) {
    const prefix = name.replace(/-/g, "_");
    assert.ok(
      Object.keys(PYODIDE_FILES).some((f) => f.startsWith(`${prefix}-`)),
      `${name} の wheel のハッシュが PYODIDE_FILES にない。直し方: npm run pin:powerbi-viewer を実行する`,
    );
  }
});

test("CSP は通信先・実行できるスクリプトを最小限に絞り、Trusted Types を強制する", () => {
  for (const name of ["index.html", BUNDLE_NAME]) {
    const policy = csp(name);
    assert.deepEqual(
      policy["default-src"],
      ["'none'"],
      `${name}: default-src が 'none' でない`,
    );
    const version = read("app.js").match(
      /PYODIDE_VERSION = "(\d+\.\d+\.\d+)"/,
    )?.[1];
    assert.deepEqual(
      policy["connect-src"],
      [`https://cdn.jsdelivr.net/pyodide/v${version}/full/`],
      `${name}: connect-src が Pyodide の配布フォルダ以外を許している。直し方: ファイルの中身を送れる送信先を増やさない`,
    );
    for (const directive of ["script-src", "style-src"]) {
      for (const bad of [
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https:",
        "*",
        "data:",
      ]) {
        assert.ok(
          !policy[directive]?.includes(bad),
          `${name}: ${directive} に ${bad} がある。直し方: インラインはハッシュで、外部は 1 ファイル単位の URL で許可する`,
        );
      }
    }
    const external = policy["script-src"].filter((s) => s.startsWith("https:"));
    const scriptTags = [
      ...read(name).matchAll(/<script\s[^>]*src="(https:[^"]+)"/g),
    ].map((m) => m[1]);
    assert.deepEqual(
      external,
      scriptTags,
      `${name}: script-src の外部 URL が <script src> と一致しない（CDN 全体やフォルダ単位で許していないか）。直し方: <script src> と同じ URL をファイル単位で書く`,
    );
    assert.deepEqual(
      policy["require-trusted-types-for"],
      ["'script'"],
      `${name}: Trusted Types が強制されていない。直し方: require-trusted-types-for 'script' を戻す`,
    );
    for (const d of ["base-uri", "form-action", "object-src"]) {
      assert.deepEqual(policy[d], ["'none'"], `${name}: ${d} が 'none' でない`);
    }
  }
});

test("CSV 書き出しは表計算ソフトの数式として実行される値を無害化する", () => {
  const { toCsv } = loadAppFunctions();
  const lines = toCsv(
    ["列"],
    [
      ['=HYPERLINK("http://evil.example","x")'],
      ["-2+3+cmd|' /C calc'!A0"],
      ["+1+1"],
      ["@SUM(A1)"],
      ["\t=1"],
      ["-5"],
      ["1.5e3"],
      [-7],
      ["普通の文字"],
    ],
  )
    .replace(/^\ufeff/, "")
    .split("\r\n");
  assert.deepEqual(
    lines.slice(1),
    [
      `"'=HYPERLINK(""http://evil.example"",""x"")"`,
      "'-2+3+cmd|' /C calc'!A0",
      "'+1+1",
      "'@SUM(A1)",
      "'\t=1",
      "-5",
      "1.5e3",
      "-7",
      "普通の文字",
    ],
    "数式として実行されうるセルに ' が付いていない（または数値に余計な ' が付いた）。直し方: app.js の csvCell",
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
    /renderMode:\s*"html"/,
  ]) {
    assert.doesNotMatch(
      app,
      pattern,
      `app.js に ${pattern} がある。ファイル内の文字列で HTML やスクリプトが実行されうる。直し方: h() と textContent を使い、ツールチップは renderMode: "richText" にする`,
    );
  }
  assert.match(
    app,
    /renderMode: "richText"/,
    'ツールチップが HTML 描画になっている。直し方: base() の tooltip に renderMode: "richText" を戻す',
  );
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
