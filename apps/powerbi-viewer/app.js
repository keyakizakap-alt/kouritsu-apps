/* Power BI データビューア — 画面とグラフ（JavaScript）
 *
 * 解析は Web Worker 上の Pyodide（Python + pandas）が担当し、この画面は結果の JSON を描くだけにする。
 * ファイルの中身は Worker に渡すだけで、ネットワークには送らない。
 * 読み込んだ値は信用しない: DOM には textContent で入れ、ECharts のツールチップに渡す文字列は esc() を通す。
 */
"use strict";

const PYODIDE_VERSION = "314.0.7";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
// pyodide.js の SHA-384。バージョンを上げるときは README の手順で再計算する
const PYODIDE_INTEGRITY = "sha384-hYKrcQ7FiKU7f1c92md9N2eh7BoBVX4CPkNDfQyyVclsjZevvDOBUkajGcYk1EF8";
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const COUNT = "__count__";
const AGG_LABELS = {
  sum: "合計",
  mean: "平均",
  median: "中央値",
  min: "最小",
  max: "最大",
  count: "件数",
  nunique: "個別件数",
};
const FREQ_LABELS = { D: "日", W: "週", M: "月", Q: "四半期", Y: "年" };
const KIND_LABELS = { number: "数値", datetime: "日付", category: "カテゴリ", text: "テキスト" };

// ------------------------------------------------------------------ Python エンジン（Worker）

/* Worker の中身。file:// で開いても動くよう、別ファイルにせず Blob から起動する。 */
function workerMain() {
  let api = null;
  let apiLoad = null;
  const send = (msg) => self.postMessage(msg);

  self.onmessage = async (event) => {
    const { id, type, payload } = event.data;
    try {
      let result;
      if (type === "init") {
        send({ type: "progress", text: "Python ランタイムを取得中…" });
        // CDN の改ざんに備え、ハッシュが一致したスクリプトだけを実行する
        const res = await fetch(payload.indexURL + "pyodide.js", { integrity: payload.integrity });
        if (!res.ok) throw new Error(`pyodide.js を取得できません（HTTP ${res.status}）`);
        const url = URL.createObjectURL(await res.blob());
        importScripts(url);
        URL.revokeObjectURL(url);
        const pyodide = await self.loadPyodide({ indexURL: payload.indexURL });
        send({ type: "progress", text: "pandas を読み込み中…" });
        await pyodide.loadPackage(["numpy", "pandas", "python-calamine"]);
        send({ type: "progress", text: "解析エンジンを初期化中…" });
        const ns = pyodide.globals.get("dict")();
        ns.set("__name__", "analysis");
        pyodide.runPython(payload.source, { globals: ns });
        api = ns.get("api");
        apiLoad = ns.get("api_load");
        result = pyodide.version;
      } else if (type === "load") {
        result = apiLoad(payload.bytes, payload.name, payload.sheet ?? null);
      } else {
        result = api(payload.method, JSON.stringify(payload.args || {}));
      }
      send({ id, ok: true, result });
    } catch (err) {
      send({ id, ok: false, error: String((err && err.message) || err) });
    }
  };
}

class UserFacingError extends Error {}

const engine = (() => {
  const pending = new Map();
  let seq = 0;
  let worker = null;
  let ready = null;

  function rpc(type, payload, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload }, transfer);
    });
  }

  function start() {
    if (ready) return ready;
    const source = self.POWERBI_VIEWER_PY;
    if (typeof source !== "string") {
      ready = Promise.reject(new Error("analysis.py.js がありません。npm run build:powerbi-viewer を実行してください"));
      return ready;
    }
    const blob = new Blob([`(${workerMain.toString()})();`], { type: "text/javascript" });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") return setEngine("loading", data.text);
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
    };
    worker.onerror = (e) => setEngine("error", `Python を起動できません: ${e.message || "不明なエラー"}`);
    ready = rpc("init", { indexURL: PYODIDE_URL, integrity: PYODIDE_INTEGRITY, source }).then(
      (version) => setEngine("ready", `Python 準備完了（Pyodide ${version}）`),
      (err) => {
        setEngine("error", "Python を読み込めませんでした");
        throw new UserFacingError(
          `解析エンジン（Pyodide）を読み込めませんでした: ${err.message}\n直し方: インターネット接続と、cdn.jsdelivr.net への通信が許可されているか確認してページを再読み込みしてください。`,
        );
      },
    );
    return ready;
  }

  function parse(raw) {
    const res = JSON.parse(raw);
    if (!res.ok) throw new UserFacingError(res.error);
    return res.data;
  }

  return {
    start,
    async call(method, args = {}) {
      await start();
      return parse(await rpc("call", { method, args }));
    },
    async load(buffer, name, sheet) {
      await start();
      const bytes = new Uint8Array(buffer.slice(0)); // 元の ArrayBuffer はシート切替用に残す
      return parse(await rpc("load", { bytes, name, sheet }, [bytes.buffer]));
    },
  };
})();

// ------------------------------------------------------------------ DOM ヘルパー

const $ = (id) => document.getElementById(id);

/** 要素を作る。文字列の子要素は必ずテキストノードになる（HTML として解釈しない）。 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const nfSmall = new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 4 });
const nfCompact = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumSignificantDigits: 3 });

function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v !== "number") return String(v);
  return Math.abs(v) < 1 && v !== 0 ? nfSmall.format(v) : nf.format(v);
}

function compact(v) {
  if (v === null || v === undefined) return "—";
  return Math.abs(v) < 10000 ? fmt(v) : nfCompact.format(v);
}

function option(value, label, selected) {
  return h("option", { value, selected: value === selected }, label);
}

function selectField(label, options, value, onChange) {
  const sel = h("select", { onchange: (e) => onChange(e.target.value) }, options.map(([v, l]) => option(v, l, value)));
  return h("label", { class: "field" }, h("span", {}, label), sel);
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(header, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // 先頭が = + - @ のセルは Excel で数式として実行されないよう ' を付ける
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

function downloadCsv(name, header, rows) {
  download(`${baseName()}_${name}.csv`, new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
}

function baseName() {
  return (state.meta?.name || "data").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
}

// ------------------------------------------------------------------ 状態

const state = {
  file: null, // { name, buffer }
  meta: null,
  tab: "overview",
  ctl: {},
  views: {}, // カードごとの「グラフ / 表」
  preview: { page: 0, search: "", sort: null, desc: false },
  colorMap: new Map(), // 系列名 → 色の番号（フィルターで系列が減っても色を変えない）
  charts: [],
  renderToken: 0,
};

function setEngine(status, text) {
  $("engine").dataset.state = status;
  $("engine-text").textContent = text;
  $("engine").title = text;
}

let busyTimer = null;
let busyCount = 0;
async function withBusy(text, fn) {
  busyCount++;
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    $("busy-text").textContent = text;
    $("busy").hidden = false;
  }, 250);
  try {
    return await fn();
  } finally {
    if (--busyCount === 0) {
      clearTimeout(busyTimer);
      $("busy").hidden = true;
    }
  }
}

function showLoadError(err) {
  const box = $("load-error");
  box.textContent = err instanceof UserFacingError ? err.message : `読み込みに失敗しました: ${err.message || err}`;
  box.hidden = false;
  if (!$("workspace").hidden) {
    $("panel").prepend(h("p", { class: "error", role: "alert" }, box.textContent));
  }
}

// ------------------------------------------------------------------ 読み込み

async function openFile(file) {
  $("load-error").hidden = true;
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    return showLoadError(new UserFacingError(`ファイルが大きすぎます（${Math.round(file.size / 1048576)}MB）。直し方: 200MB 以下に分割するか、Power BI 側で列や期間を絞ってエクスポートしてください。`));
  }
  try {
    const buffer = await file.arrayBuffer();
    const meta = await withBusy("ファイルを解析中…", () => engine.load(buffer, file.name, null));
    state.file = { name: file.name, buffer };
    start(meta);
  } catch (err) {
    showLoadError(err);
  }
}

async function openSample() {
  $("load-error").hidden = true;
  try {
    const meta = await withBusy("サンプルを生成中…", () => engine.call("load_sample"));
    state.file = null;
    start(meta);
  } catch (err) {
    showLoadError(err);
  }
}

async function changeSheet(sheet) {
  if (!state.file) return;
  try {
    const meta = await withBusy("シートを読み込み中…", () => engine.load(state.file.buffer, state.file.name, sheet));
    start(meta);
  } catch (err) {
    showLoadError(err);
  }
}

function start(meta) {
  state.meta = meta;
  state.ctl = defaultControls(meta);
  state.views = {};
  state.preview = { page: 0, search: "", sort: null, desc: false };
  state.colorMap = new Map();
  $("landing").hidden = true;
  $("workspace").hidden = false;
  $("file-name").textContent = meta.name;
  renderFileInfo();
  renderFilterColumns();
  renderChips();
  closeEditor();
  renderKpis();
  selectTab(state.tab);
  window.scrollTo({ top: 0 });
}

function defaultControls(meta) {
  const dims = meta.dimensions.filter((d) => !meta.measures.includes(d));
  const allDims = dims.length ? dims : meta.dimensions;
  const measures = meta.measures.filter((m) => !meta.dimensions.includes(m));
  const measure = measures[0] || meta.measures[0] || COUNT;
  return {
    group: { dimension: allDims[0], measure, agg: measure === COUNT ? "count" : "sum", top: "15" },
    trend: { date: meta.datetimes[0], measure, agg: measure === COUNT ? "count" : "sum", freq: "M", split: "" },
    dist: { column: measure === COUNT ? meta.measures[0] : measure, bins: "0" },
    pivot: { row: allDims[0], column: allDims[1] || allDims[0], measure, agg: measure === COUNT ? "count" : "sum" },
  };
}

function renderFileInfo() {
  const { meta } = state;
  const info = meta.info || {};
  const parts = [`${fmt(meta.rows)} 行 × ${meta.columns.length} 列`];
  if (info.sheet) parts.push(`シート「${info.sheet}」`);
  if (info.encoding) parts.push(info.encoding);
  if (info.delimiter) parts.push(`${info.delimiter}区切り`);
  $("file-sub").textContent = parts.join(" · ");

  const sheetField = $("sheet-field");
  const sheets = info.sheets || [];
  sheetField.hidden = sheets.length < 2;
  $("sheet-select").replaceChildren(...sheets.map((s) => option(s, s, info.sheet)));

  document.querySelectorAll(".notice").forEach((n) => n.remove());
  const notices = [];
  if (info.truncated) {
    notices.push(h("p", { class: "notice", role: "note" }, "このファイルは Power BI のエクスポート上限に達しており、一部の行が省略されています。全件が必要な場合は、フィルターで分割してエクスポートしてください。"));
  }
  for (const note of info.notes || []) {
    if (/exceeded|omitted|超え|省略/i.test(note)) continue;
    notices.push(h("p", { class: "notice notice-info", role: "note" }, `ファイル内の注記: ${note}`));
  }
  if (!state.file && !info.sheet) {
    notices.push(h("p", { class: "notice notice-info", role: "note" }, "表示中のデータは操作確認用の架空データです。"));
  }
  $("workspace").querySelector(".filebar").after(...notices);
}

// ------------------------------------------------------------------ KPI

function renderKpis() {
  const { meta } = state;
  const filtered = meta.filtered_rows !== meta.rows;
  const tiles = meta.kpis.map((k) =>
    h(
      "div",
      { class: "kpi" },
      h("p", { class: "kpi-label", title: k.label }, k.label),
      h("p", { class: "kpi-value" }, k.format === "int" ? fmt(k.value) : compact(k.value)),
      h(
        "p",
        { class: "kpi-sub" },
        k.format === "int" ? (filtered ? `全 ${fmt(k.total)} 行中（${((k.value / k.total) * 100 || 0).toFixed(1)}%）` : "全件") : filtered ? "フィルター適用後" : fmt(k.value),
      ),
    ),
  );
  $("kpis").replaceChildren(...tiles);
}

// ------------------------------------------------------------------ フィルター

function columnKind(name) {
  return state.meta.columns.find((c) => c.name === name)?.kind;
}

function renderFilterColumns() {
  const sel = $("filter-column");
  sel.replaceChildren(
    option("", "＋ 列を選択…", ""),
    ...state.meta.columns.map((c) => option(c.name, `${c.name}（${KIND_LABELS[c.kind]}）`, "")),
  );
}

function filterText(col, f) {
  if (f.type === "in") {
    const head = f.values.slice(0, 2).join("、");
    return f.values.length > 2 ? `${head} ほか${f.values.length - 2}件` : head || "（なし）";
  }
  const lo = f.min ?? "";
  const hi = f.max ?? "";
  const show = (v) => (typeof v === "number" ? fmt(v) : v);
  return `${show(lo)} 〜 ${show(hi)}`;
}

function renderChips() {
  const filters = state.meta.filters || {};
  const items = Object.entries(filters).map(([col, f]) =>
    h(
      "li",
      { class: "chip" },
      h(
        "span",
        { class: "chip-text", title: `${col}: ${filterText(col, f)}`, role: "button", tabindex: "0", onclick: () => openEditor(col), onkeydown: (e) => e.key === "Enter" && openEditor(col) },
        h("b", {}, col),
        `: ${filterText(col, f)}`,
      ),
      h("button", { type: "button", "aria-label": `${col} のフィルターを解除`, onclick: () => applyFilter(col, null) }, "×"),
    ),
  );
  $("filter-chips").replaceChildren(...items);
  $("clear-filters").hidden = items.length === 0;
}

function closeEditor() {
  $("filter-editor").hidden = true;
  $("filter-editor").replaceChildren();
  $("filter-column").value = "";
}

async function openEditor(col) {
  const box = $("filter-editor");
  $("filter-column").value = col;
  let opts;
  try {
    opts = await engine.call("filter_options", { column: col });
  } catch (err) {
    return showLoadError(err);
  }
  const current = (state.meta.filters || {})[col];
  const title = h("p", { class: "card-title" }, col);
  const actions = (getValue) =>
    h(
      "div",
      { class: "editor-actions" },
      h("button", { type: "button", class: "link-btn", onclick: closeEditor }, "キャンセル"),
      h("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => applyFilter(col, getValue()) }, "適用"),
    );

  if (opts.kind === "in") {
    const selected = new Set(current?.type === "in" ? current.values : opts.values.map((v) => v.value));
    const list = h("ul", { class: "checklist" });
    const draw = (values) =>
      list.replaceChildren(
        ...values.map((v) =>
          h(
            "li",
            {},
            h(
              "label",
              {},
              h("input", { type: "checkbox", checked: selected.has(v.value), onchange: (e) => (e.target.checked ? selected.add(v.value) : selected.delete(v.value)) }),
              h("span", { class: "val", title: v.value }, v.value),
              h("span", { class: "count" }, fmt(v.count)),
            ),
          ),
        ),
      );
    let shown = opts.values;
    draw(shown);
    const search = h("input", {
      type: "search",
      placeholder: "値を検索",
      "aria-label": "値を検索",
      oninput: debounce(async (e) => {
        const q = e.target.value.trim();
        const res = opts.total > opts.values.length ? (await engine.call("filter_options", { column: col, search: q })).values : opts.values.filter((v) => v.value.toLowerCase().includes(q.toLowerCase()));
        shown = res;
        draw(shown);
      }, 200),
    });
    const bulk = h(
      "div",
      { class: "editor-actions" },
      h("button", { type: "button", class: "link-btn", onclick: () => (shown.forEach((v) => selected.add(v.value)), draw(shown)) }, "表示中をすべて選択"),
      h("button", { type: "button", class: "link-btn", onclick: () => (shown.forEach((v) => selected.delete(v.value)), draw(shown)) }, "表示中を解除"),
    );
    const note = opts.total > opts.values.length ? h("p", { class: "hint" }, `値が多いため上位 ${opts.values.length} 件を表示しています（全 ${fmt(opts.total)} 件）。検索で絞り込めます。`) : null;
    box.replaceChildren(title, search, bulk, list, note, actions(() => ({ type: "in", values: [...selected] })));
  } else {
    const isDate = opts.kind === "date";
    const attrs = isDate ? { type: "date", min: opts.min, max: opts.max } : { type: "number", step: "any" };
    const lo = h("input", { ...attrs, value: current?.min ?? "", placeholder: fmt(opts.min), "aria-label": "下限" });
    const hi = h("input", { ...attrs, value: current?.max ?? "", placeholder: fmt(opts.max), "aria-label": "上限" });
    box.replaceChildren(
      title,
      h("div", { class: "row" }, h("label", { class: "field" }, h("span", {}, isDate ? "開始日" : "最小値"), lo), h("label", { class: "field" }, h("span", {}, isDate ? "終了日" : "最大値"), hi)),
      h("p", { class: "hint" }, `データの範囲: ${fmt(opts.min)} 〜 ${fmt(opts.max)}（境界を含む）。片方だけの指定もできます。`),
      actions(() => ({ type: "range", min: lo.value === "" ? null : lo.value, max: hi.value === "" ? null : hi.value })),
    );
  }
  box.hidden = false;
  box.querySelector("input")?.focus();
}

async function applyFilter(col, value) {
  const filters = { ...(state.meta.filters || {}) };
  if (value === null) delete filters[col];
  else filters[col] = value;
  await setFilters(filters);
}

async function setFilters(filters) {
  try {
    const meta = await withBusy("フィルターを適用中…", () => engine.call("set_filters", { filters }));
    state.meta = meta;
    state.preview.page = 0;
    closeEditor();
    renderChips();
    renderKpis();
    renderTab();
  } catch (err) {
    showLoadError(err);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ------------------------------------------------------------------ タブ

const TABS = {
  overview: renderOverview,
  group: renderGroup,
  trend: renderTrend,
  dist: renderDist,
  corr: renderCorr,
  pivot: renderPivot,
  data: renderData,
};

function selectTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll("#tabs [role=tab]")) {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  renderTab();
}

function disposeCharts() {
  for (const { chart, observer } of state.charts) {
    observer.disconnect();
    chart.dispose();
  }
  state.charts = [];
}

async function renderTab() {
  const token = ++state.renderToken;
  const panel = $("panel");
  try {
    const nodes = await withBusy("集計中…", () => TABS[state.tab]());
    if (token !== state.renderToken) return; // 後から始めた描画を優先する
    disposeCharts();
    panel.replaceChildren(...[nodes].flat());
    for (const fn of pendingCharts.splice(0)) fn();
  } catch (err) {
    if (token !== state.renderToken) return;
    pendingCharts.length = 0;
    disposeCharts();
    panel.replaceChildren(h("p", { class: "error", role: "alert" }, err instanceof UserFacingError ? err.message : `表示できませんでした: ${err.message}`));
  }
}

function card({ title, sub, actions = [], body }) {
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("h2", { class: "card-title" }, title), sub ? h("p", { class: "card-sub" }, sub) : null), h("div", { class: "card-actions" }, actions)),
    body,
  );
}

function controlsRow(...fields) {
  return h("div", { class: "controls" }, fields);
}

function emptyState(text) {
  return h("div", { class: "card" }, h("p", { class: "empty" }, text));
}

function measureOptions(includeCount = true) {
  const opts = state.meta.measures.map((m) => [m, m]);
  return includeCount ? [[COUNT, "件数（行数）"], ...opts] : opts;
}

function aggOptions(measure) {
  if (measure === COUNT) return [["count", "件数"]];
  return Object.entries(AGG_LABELS);
}

function dimOptions() {
  return state.meta.dimensions.map((d) => [d, d]);
}

function measureLabel(measure, agg) {
  return measure === COUNT ? "件数" : `${measure}（${AGG_LABELS[agg]}）`;
}

/** カードに「グラフ / 表」の切替と書き出しボタンを付ける。 */
function chartCard({ key, title, sub, chartBuilder, table, csv, tall, height }) {
  const view = state.views[key] || "chart";
  const chartEl = h("div", { class: `chart${tall ? " chart-tall" : ""}`, role: "img", "aria-label": `${title}のグラフ。表で見るボタンで数値を確認できます。` });
  if (height) chartEl.style.height = `${height}px`;
  const tableEl = h("div", { class: "table-wrap" }, table());
  chartEl.hidden = view !== "chart";
  tableEl.hidden = view !== "table";
  let chart = null;
  const toggle = (v) => {
    state.views[key] = v;
    chartEl.hidden = v !== "chart";
    tableEl.hidden = v !== "table";
    btnChart.setAttribute("aria-pressed", String(v === "chart"));
    btnTable.setAttribute("aria-pressed", String(v === "table"));
    if (v === "chart") chart?.resize();
  };
  const btnChart = h("button", { type: "button", class: "btn btn-sm", "aria-pressed": String(view === "chart"), onclick: () => toggle("chart") }, "グラフ");
  const btnTable = h("button", { type: "button", class: "btn btn-sm", "aria-pressed": String(view === "table"), onclick: () => toggle("table") }, "表");
  const btnCsv = h("button", { type: "button", class: "btn btn-sm", onclick: csv }, "CSV");
  const btnPng = h(
    "button",
    {
      type: "button",
      class: "btn btn-sm",
      onclick: () => {
        if (!chart) return;
        toggle("chart");
        const url = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: tokens().surface });
        fetch(url)
          .then((r) => r.blob())
          .then((b) => download(`${baseName()}_${key}.png`, b));
      },
    },
    "PNG",
  );
  pendingCharts.push(() => {
    chart = echarts.init(chartEl, null, { renderer: "canvas" });
    chart.setOption(chartBuilder(tokens()));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(chartEl);
    state.charts.push({ chart, observer });
  });
  return card({ title, sub, actions: [btnChart, btnTable, btnCsv, btnPng], body: [chartEl, tableEl] });
}

const pendingCharts = [];

function simpleTable(header, rows, numericCols = []) {
  return h(
    "table",
    {},
    h("thead", {}, h("tr", {}, header.map((c, i) => h("th", { class: numericCols.includes(i) ? "num" : null, scope: "col" }, c)))),
    h(
      "tbody",
      {},
      rows.map((r) =>
        h(
          "tr",
          {},
          r.map((v, i) => h("td", { class: [numericCols.includes(i) ? "num" : "", v === null ? "null" : ""].join(" ").trim() || null, title: typeof v === "string" ? v : null }, numericCols.includes(i) ? fmt(v) : (v ?? "—"))),
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ チャート共通

function tokens() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    hairline: v("--hairline"),
    baseline: v("--baseline"),
    series: Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`)),
    other: v("--series-other"),
    seqLow: v("--seq-low"),
    seqHigh: v("--seq-high"),
    divNeg: v("--div-neg"),
    divMid: v("--div-mid"),
    divPos: v("--div-pos"),
    dark: document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches),
    font: v("--font"),
  };
}

function base(t) {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: t.font, color: t.ink2 },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.hairline,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 8px 24px -12px rgba(0,0,0,.35);",
      confine: true,
    },
  };
}

function valueAxis(t, extra = {}) {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.hairline, type: "solid" } },
    axisLabel: { color: t.muted, formatter: (v) => compact(v) },
    ...extra,
  };
}

function categoryAxis(t, data, extra = {}) {
  return {
    type: "category",
    data,
    axisLine: { lineStyle: { color: t.baseline } },
    axisTick: { show: false },
    axisLabel: { color: t.ink2, hideOverlap: true },
    ...extra,
  };
}

function tipRow(color, name, value) {
  const dot = color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${esc(color)};margin-right:6px"></span>` : "";
  return `<div style="display:flex;gap:16px;justify-content:space-between"><span>${dot}${esc(name)}</span><b style="font-variant-numeric:tabular-nums">${esc(value)}</b></div>`;
}

/** 系列名ごとに色を固定する。初めて見た名前から順に色番号を割り当て、8色を超えたら灰色。 */
function seriesColor(t, name) {
  if (name === "その他") return t.other;
  if (!state.colorMap.has(name)) state.colorMap.set(name, state.colorMap.size);
  const i = state.colorMap.get(name);
  return i < 8 ? t.series[i] : t.other;
}

// ------------------------------------------------------------------ 概要

async function renderOverview() {
  const [prof, ins] = await Promise.all([engine.call("profile"), engine.call("insights")]);
  const { meta } = state;
  const counts = {};
  for (const c of meta.columns) counts[c.kind] = (counts[c.kind] || 0) + 1;

  const insightCard = card({
    title: "自動インサイト",
    sub: "集計結果から機械的に読み取れる事実だけを表示します",
    body: ins.items.length ? h("ul", { class: "insights" }, ins.items.map((i) => h("li", {}, i.text))) : h("p", { class: "empty" }, "目立った傾向は検出されませんでした。"),
  });
  const structure = card({
    title: "データの構成",
    sub: `フィルター後 ${fmt(prof.rows)} 行`,
    body: h(
      "dl",
      { class: "stats" },
      Object.entries(KIND_LABELS).map(([k, label]) => h("div", { class: "stat" }, h("dt", {}, `${label}列`), h("dd", {}, `${counts[k] || 0}`))),
    ),
  });

  const rows = prof.columns.map((c) => {
    const missingPct = c.count + c.missing ? (c.missing / (c.count + c.missing)) * 100 : 0;
    let summary = "";
    if (c.kind === "number") summary = `${fmt(c.min)} 〜 ${fmt(c.max)}（平均 ${fmt(c.mean)}）`;
    else if (c.kind === "datetime") summary = `${c.min ?? "—"} 〜 ${c.max ?? "—"}`;
    else summary = (c.top || []).map((t) => `${t.value}（${fmt(t.count)}）`).join("、");
    return h(
      "tr",
      {},
      h("th", { scope: "row", title: c.name }, c.name),
      h("td", {}, h("span", { class: "badge", dataset: { kind: c.kind } }, KIND_LABELS[c.kind])),
      h("td", { class: "num" }, h("span", { class: "meter", "aria-hidden": "true" }, h("span", { style: `width:${Math.min(100, missingPct)}%` })), `${missingPct.toFixed(1)}%`),
      h("td", { class: "num" }, fmt(c.unique)),
      h("td", { title: summary }, summary),
    );
  });
  const profileCard = card({
    title: "列のプロファイル",
    sub: "型は自動判定です。数値や日付として扱われていない列は、元データの表記を確認してください。",
    actions: [
      h(
        "button",
        {
          type: "button",
          class: "btn btn-sm",
          onclick: () =>
            downloadCsv(
              "列プロファイル",
              ["列名", "型", "件数", "空白", "一意数", "最小", "最大", "平均", "合計"],
              prof.columns.map((c) => [c.name, KIND_LABELS[c.kind], c.count, c.missing, c.unique, c.min ?? "", c.max ?? "", c.mean ?? "", c.sum ?? ""]),
            ),
        },
        "CSV",
      ),
    ],
    body: h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, ["列名", "型", "空白率", "一意数", "要約"].map((c, i) => h("th", { scope: "col", class: i === 2 || i === 3 ? "num" : null }, c)))),
        h("tbody", {}, rows),
      ),
    ),
  });
  return [h("div", { class: "grid-2" }, insightCard, structure), profileCard];
}

// ------------------------------------------------------------------ 集計（カテゴリ別）

async function renderGroup() {
  const c = state.ctl.group;
  if (!c.dimension) return emptyState("集計の軸に使えるカテゴリ列がありません。");
  if (!aggOptions(c.measure).some(([a]) => a === c.agg)) c.agg = c.measure === COUNT ? "count" : "sum";
  const res = await engine.call("group", { dimension: c.dimension, measure: c.measure, agg: c.agg, top: Number(c.top) });
  const update = (k) => (v) => {
    c[k] = v;
    renderTab();
  };
  const controls = controlsRow(
    selectField("軸（カテゴリ）", dimOptions(), c.dimension, update("dimension")),
    selectField("値", measureOptions(), c.measure, update("measure")),
    selectField("集計方法", aggOptions(c.measure), c.agg, update("agg")),
    selectField("表示件数", [["10", "上位10"], ["15", "上位15"], ["25", "上位25"], ["50", "上位50"]], c.top, update("top")),
  );
  if (!res.rows.length) return [controls, emptyState("集計できる行がありません。フィルターを見直してください。")];
  const rows = [...res.rows, ...(res.other ? [res.other] : [])];
  const label = measureLabel(c.measure, res.agg);
  const share = (v) => (res.total ? `${((v / res.total) * 100).toFixed(1)}%` : "");
  const chartHeight = Math.max(260, rows.length * 30 + 60);

  const chart = chartCard({
    key: "group",
    title: `${c.dimension} 別の${label}`,
    sub: `${fmt(res.groups)} グループ中 上位 ${res.rows.length}${res.other ? "（残りは「その他」に合算）" : ""}`,
    height: chartHeight,
    chartBuilder: (t) => ({
      ...base(t),
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...base(t).tooltip,
        trigger: "item",
        formatter: (p) => `<div style="margin-bottom:4px;color:${esc(t.muted)}">${esc(p.name)}</div>${tipRow(p.color, label, fmt(p.value))}${res.total ? tipRow(null, "構成比", share(p.value)) : ""}`,
      },
      xAxis: valueAxis(t),
      yAxis: categoryAxis(t, rows.map((r) => r.label), { inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2, width: 160, overflow: "truncate" } }),
      series: [
        {
          type: "bar",
          data: rows.map((r, i) => ({ value: r.value, itemStyle: { color: res.other && i === rows.length - 1 ? t.other : t.series[0] } })),
          barMaxWidth: 20,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: t.ink2, formatter: (p) => (p.dataIndex === 0 ? compact(p.value) : "") },
          emphasis: { focus: "self" },
        },
      ],
    }),
    table: () => simpleTable([c.dimension, label, ...(res.total ? ["構成比"] : [])], rows.map((r) => [r.label, r.value, ...(res.total ? [share(r.value)] : [])]), [1]),
    csv: () => downloadCsv(`${c.dimension}別`, [c.dimension, label], rows.map((r) => [r.label, r.value])),
  });
  return [controls, chart];
}

// ------------------------------------------------------------------ 時系列

async function renderTrend() {
  const c = state.ctl.trend;
  if (!c.date) return emptyState("日付として判定された列がありません。日付列が「2025-01-31」「2025/1/31」「2025年1月31日」などの形式か確認してください。");
  if (!aggOptions(c.measure).some(([a]) => a === c.agg)) c.agg = c.measure === COUNT ? "count" : "sum";
  const res = await engine.call("timeseries", { date_column: c.date, measure: c.measure, agg: c.agg, freq: c.freq, split: c.split || null, max_series: 5 });
  const update = (k) => (v) => {
    c[k] = v;
    renderTab();
  };
  const controls = controlsRow(
    selectField("日付列", state.meta.datetimes.map((d) => [d, d]), c.date, update("date")),
    selectField("値", measureOptions(), c.measure, update("measure")),
    selectField("集計方法", aggOptions(c.measure), c.agg, update("agg")),
    selectField("単位", Object.entries(FREQ_LABELS), c.freq, update("freq")),
    selectField("内訳（上位5件）", [["", "なし"], ...dimOptions()], c.split, update("split")),
  );
  if (!res.periods.length) return [controls, emptyState("日付が入っている行がありません。")];
  const label = measureLabel(c.measure, res.agg);
  const multi = res.series.length > 1;
  const zoom = res.periods.length > 36;

  const chart = chartCard({
    key: "trend",
    title: `${FREQ_LABELS[c.freq]}別の${label}${c.split ? `（${c.split} 別）` : ""}`,
    sub: `${res.periods[0]} 〜 ${res.periods[res.periods.length - 1]}・${res.periods.length} 期間。データのない期間は ${["sum", "count"].includes(res.agg) ? "0" : "空白"} として表示します。`,
    tall: multi,
    chartBuilder: (t) => ({
      ...base(t),
      grid: { left: 8, right: 24, top: multi ? 44 : 16, bottom: zoom ? 56 : 8, containLabel: true },
      legend: multi ? { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: t.ink2 } } : undefined,
      tooltip: {
        ...base(t).tooltip,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: t.baseline } },
        formatter: (ps) => `<div style="margin-bottom:4px;color:${esc(t.muted)}">${esc(ps[0].axisValue)}</div>${ps.map((p) => tipRow(p.color, multi ? p.seriesName : label, fmt(p.value))).join("")}`,
      },
      xAxis: categoryAxis(t, res.periods, { boundaryGap: false }),
      yAxis: valueAxis(t),
      dataZoom: zoom ? [{ type: "inside" }, { type: "slider", height: 20, bottom: 8, borderColor: t.hairline, textStyle: { color: t.muted } }] : undefined,
      series: res.series.map((s) => {
        const color = multi ? seriesColor(t, s.name) : t.series[0];
        return {
          name: s.name,
          type: "line",
          data: s.values,
          color,
          showSymbol: !multi && res.periods.length <= 24,
          symbolSize: 8,
          lineStyle: { width: 2 },
          connectNulls: false,
          areaStyle: multi ? undefined : { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + "33" }, { offset: 1, color: color + "00" }] } },
          emphasis: { focus: "series" },
        };
      }),
    }),
    table: () => simpleTable(["期間", ...res.series.map((s) => s.name)], res.periods.map((p, i) => [p, ...res.series.map((s) => s.values[i])]), res.series.map((_, i) => i + 1)),
    csv: () => downloadCsv(`${FREQ_LABELS[c.freq]}別推移`, ["期間", ...res.series.map((s) => s.name)], res.periods.map((p, i) => [p, ...res.series.map((s) => s.values[i] ?? "")])),
  });
  return [controls, chart];
}

// ------------------------------------------------------------------ 分布

async function renderDist() {
  const c = state.ctl.dist;
  if (!c.column) return emptyState("数値として判定された列がありません。");
  const res = await engine.call("histogram", { column: c.column, bins: Number(c.bins) });
  const update = (k) => (v) => {
    c[k] = v;
    renderTab();
  };
  const controls = controlsRow(
    selectField("数値列", measureOptions(false), c.column, update("column")),
    selectField("階級数", [["0", "自動"], ["10", "10"], ["20", "20"], ["40", "40"]], c.bins, update("bins")),
  );
  if (!res.bins.length) return [controls, emptyState("値が入っている行がありません。")];
  const labels = res.bins.map((b) => `${compact(b.from)}–${compact(b.to)}`);
  const s = res.stats;
  const statList = h(
    "dl",
    { class: "stats" },
    [
      ["件数", s.count],
      ["平均", s.mean],
      ["標準偏差", s.std],
      ["最小", s.min],
      ["第1四分位", s.q1],
      ["中央値", s.median],
      ["第3四分位", s.q3],
      ["最大", s.max],
    ].map(([k, v]) => h("div", { class: "stat" }, h("dt", {}, k), h("dd", {}, fmt(v)))),
  );
  const chart = chartCard({
    key: "dist",
    title: `${c.column} の分布`,
    sub: `${res.bins.length} 階級（各階級は下限を含み上限を含まない。最後の階級のみ上限を含む）`,
    chartBuilder: (t) => ({
      ...base(t),
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...base(t).tooltip,
        trigger: "item",
        formatter: (p) => {
          const b = res.bins[p.dataIndex];
          return `<div style="margin-bottom:4px;color:${esc(t.muted)}">${esc(fmt(b.from))} 〜 ${esc(fmt(b.to))}</div>${tipRow(p.color, "件数", fmt(b.count))}${tipRow(null, "割合", `${((b.count / s.count) * 100).toFixed(1)}%`)}`;
        },
      },
      xAxis: categoryAxis(t, labels),
      yAxis: valueAxis(t),
      series: [{ type: "bar", data: res.bins.map((b) => b.count), barCategoryGap: "6%", itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] } }],
    }),
    table: () => simpleTable(["下限", "上限", "件数"], res.bins.map((b) => [b.from, b.to, b.count]), [0, 1, 2]),
    csv: () => downloadCsv(`${c.column}_分布`, ["下限", "上限", "件数"], res.bins.map((b) => [b.from, b.to, b.count])),
  });
  chart.append(statList);
  return [controls, chart];
}

// ------------------------------------------------------------------ 相関

async function renderCorr() {
  const res = await engine.call("correlation");
  if (res.columns.length < 2) return emptyState("相関を計算するには、値が2種類以上ある数値列が2列以上必要です。");
  const n = res.columns.length;
  const data = [];
  res.matrix.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v])));
  const chart = chartCard({
    key: "corr",
    title: "数値列どうしの相関（ピアソン）",
    sub: "1 に近いほど同じ方向に、-1 に近いほど逆方向に動きます。相関は因果関係を示しません。",
    height: Math.min(640, Math.max(280, n * 64 + 120)),
    chartBuilder: (t) => ({
      ...base(t),
      grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
      tooltip: {
        ...base(t).tooltip,
        trigger: "item",
        formatter: (p) => `${esc(res.columns[p.value[1]])} × ${esc(res.columns[p.value[0]])}<br/><b>r = ${p.value[2] === null ? "—" : p.value[2].toFixed(3)}</b>`,
      },
      xAxis: categoryAxis(t, res.columns, { axisLabel: { color: t.ink2, rotate: n > 5 ? 30 : 0, width: 120, overflow: "truncate" }, axisLine: { show: false }, splitArea: { show: false } }),
      yAxis: categoryAxis(t, res.columns, { inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2, width: 140, overflow: "truncate" } }),
      visualMap: { min: -1, max: 1, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 160, itemWidth: 10, text: ["+1", "-1"], textStyle: { color: t.muted }, inRange: { color: [t.divNeg, t.divMid, t.divPos] } },
      series: [
        {
          type: "heatmap",
          data: data.map(([x, y, v]) => ({ value: [x, y, v], label: { color: v !== null && Math.abs(v) > 0.6 ? "#fff" : t.ink } })),
          label: { show: n <= 10, formatter: (p) => (p.value[2] === null ? "" : p.value[2].toFixed(2)), fontSize: 11 },
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
        },
      ],
    }),
    table: () => simpleTable(["", ...res.columns], res.columns.map((c, i) => [c, ...res.matrix[i].map((v) => (v === null ? null : Number(v.toFixed(3))))]), res.columns.map((_, i) => i + 1)),
    csv: () => downloadCsv("相関行列", ["", ...res.columns], res.columns.map((c, i) => [c, ...res.matrix[i]])),
  });
  return chart;
}

// ------------------------------------------------------------------ クロス集計

async function renderPivot() {
  const c = state.ctl.pivot;
  if (!c.row) return emptyState("クロス集計に使えるカテゴリ列がありません。");
  if (!aggOptions(c.measure).some(([a]) => a === c.agg)) c.agg = c.measure === COUNT ? "count" : "sum";
  const res = await engine.call("pivot", { row: c.row, column: c.column, measure: c.measure, agg: c.agg });
  const update = (k) => (v) => {
    c[k] = v;
    renderTab();
  };
  const controls = controlsRow(
    selectField("行", dimOptions(), c.row, update("row")),
    selectField("列", dimOptions(), c.column, update("column")),
    selectField("値", measureOptions(), c.measure, update("measure")),
    selectField("集計方法", aggOptions(c.measure), c.agg, update("agg")),
  );
  if (!res.rows.length) return [controls, emptyState("集計できる行がありません。")];
  const label = measureLabel(c.measure, res.agg);
  const flat = res.matrix.flat().filter((v) => v !== null);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const data = [];
  res.matrix.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v])));
  const cells = res.rows.length * res.columns.length;
  const chart = chartCard({
    key: "pivot",
    title: `${c.row} × ${c.column} の${label}`,
    sub: `行は上位30、列は上位12まで（件数順）。それ以外は「その他」に合算。空白のセルは該当データなし。`,
    height: Math.min(900, Math.max(240, res.rows.length * 40 + 140)),
    chartBuilder: (t) => ({
      ...base(t),
      grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
      tooltip: {
        ...base(t).tooltip,
        trigger: "item",
        formatter: (p) => `<div style="margin-bottom:4px;color:${esc(t.muted)}">${esc(res.rows[p.value[1]])} × ${esc(res.columns[p.value[0]])}</div>${tipRow(null, label, fmt(p.value[2]))}`,
      },
      xAxis: categoryAxis(t, res.columns, { position: "top", axisLine: { show: false }, axisLabel: { color: t.ink2, width: 100, overflow: "truncate", interval: 0, rotate: res.columns.length > 6 ? 30 : 0 } }),
      yAxis: categoryAxis(t, res.rows, { inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2, width: 140, overflow: "truncate", interval: 0 } }),
      visualMap: { min, max: max === min ? min + 1 : max, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 160, itemWidth: 10, text: [compact(max), compact(min)], textStyle: { color: t.muted }, inRange: { color: [t.seqLow, t.seqHigh] } },
      series: [
        {
          type: "heatmap",
          data: data.map(([x, y, v]) => {
            const ratio = v === null || max === min ? 0 : (v - min) / (max - min);
            return { value: [x, y, v], label: { color: ratio > 0.55 ? (t.dark ? "#0b0b0b" : "#fff") : t.ink } };
          }),
          label: { show: cells <= 160, formatter: (p) => (p.value[2] === null ? "" : compact(p.value[2])), fontSize: 11 },
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
        },
      ],
    }),
    table: () => simpleTable([`${c.row} \\ ${c.column}`, ...res.columns], res.rows.map((r, i) => [r, ...res.matrix[i]]), res.columns.map((_, i) => i + 1)),
    csv: () => downloadCsv("クロス集計", [`${c.row} \\ ${c.column}`, ...res.columns], res.rows.map((r, i) => [r, ...res.matrix[i].map((v) => v ?? "")])),
  });
  return [controls, chart];
}

// ------------------------------------------------------------------ データ

async function renderData() {
  const p = state.preview;
  const res = await engine.call("preview", { page: p.page, size: 50, search: p.search, sort: p.sort, desc: p.desc });
  const search = h("input", {
    type: "search",
    value: p.search,
    placeholder: "すべての列から検索",
    "aria-label": "データを検索",
    oninput: debounce((e) => {
      p.search = e.target.value;
      p.page = 0;
      renderTab().then(() => {
        const box = $("panel").querySelector("input[type=search]");
        box?.focus();
        box?.setSelectionRange(box.value.length, box.value.length);
      });
    }, 300),
  });
  const header = h(
    "tr",
    {},
    res.columns.map((c) =>
      h(
        "th",
        { scope: "col", class: c.kind === "number" ? "num" : null, "aria-sort": p.sort === c.name ? (p.desc ? "descending" : "ascending") : null },
        h(
          "button",
          {
            type: "button",
            dataset: { dir: p.sort === c.name ? (p.desc ? "desc" : "asc") : "" },
            title: `${c.name}（${KIND_LABELS[c.kind]}）で並べ替え`,
            onclick: () => {
              if (p.sort === c.name) p.desc = !p.desc;
              else Object.assign(p, { sort: c.name, desc: c.kind === "number" });
              renderTab();
            },
          },
          c.name,
        ),
      ),
    ),
  );
  const body = res.rows.map((r) =>
    h(
      "tr",
      {},
      r.map((v, i) => {
        const num = res.columns[i].kind === "number";
        return h("td", { class: [num ? "num" : "", v === null ? "null" : ""].join(" ").trim() || null, title: typeof v === "string" ? v : null }, num ? fmt(v) : (v ?? "—"));
      }),
    ),
  );
  const go = (page) => () => {
    p.page = page;
    renderTab();
  };
  const pager = h(
    "div",
    { class: "pager" },
    h("span", {}, `${fmt(res.matched)} 行中 ${fmt(res.matched ? res.page * 50 + 1 : 0)}–${fmt(Math.min(res.matched, (res.page + 1) * 50))} 行目`),
    h(
      "div",
      { class: "pager-buttons" },
      h("button", { type: "button", class: "btn btn-sm", disabled: res.page === 0, onclick: go(0) }, "« 最初"),
      h("button", { type: "button", class: "btn btn-sm", disabled: res.page === 0, onclick: go(res.page - 1) }, "‹ 前へ"),
      h("span", { style: "align-self:center;padding:0 6px" }, `${res.page + 1} / ${res.pages}`),
      h("button", { type: "button", class: "btn btn-sm", disabled: res.page >= res.pages - 1, onclick: go(res.page + 1) }, "次へ ›"),
      h("button", { type: "button", class: "btn btn-sm", disabled: res.page >= res.pages - 1, onclick: go(res.pages - 1) }, "最後 »"),
    ),
  );
  const exportBtn = h(
    "button",
    {
      type: "button",
      class: "btn btn-sm",
      onclick: async () => {
        const all = await withBusy("書き出し中…", () => engine.call("export_rows"));
        downloadCsv("フィルター後データ", all.columns, all.rows);
      },
    },
    "フィルター後の全行を CSV",
  );
  return card({
    title: "データ",
    sub: "列名をクリックすると並べ替えます。検索・並べ替えは表示だけに反映され、集計には左のフィルターが反映されます。",
    actions: [exportBtn],
    body: [h("div", { class: "controls" }, h("label", { class: "field" }, h("span", {}, "検索"), search)), h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, header), h("tbody", {}, body))), pager],
  });
}

// ------------------------------------------------------------------ テーマ

function applyStoredTheme() {
  try {
    const t = localStorage.getItem("pbiv-theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {
    /* 保存領域が使えない環境では OS の設定に従う */
  }
}

function toggleTheme() {
  const next = tokens().dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("pbiv-theme", next);
  } catch {
    /* 無視 */
  }
  if (state.meta) renderTab();
}

// ------------------------------------------------------------------ 起動

function bindEvents() {
  for (const id of ["file-input", "file-input-2"]) {
    $(id).addEventListener("change", (e) => {
      openFile(e.target.files[0]);
      e.target.value = "";
    });
  }
  const zone = $("dropzone");
  ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, () => zone.classList.add("is-over")));
  ["dragleave", "drop"].forEach((t) => zone.addEventListener(t, () => zone.classList.remove("is-over")));
  // ページのどこにドロップしても開く（ブラウザがファイルへ移動しないようにする）
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) openFile(file);
  });
  $("sample-btn").addEventListener("click", openSample);
  $("sheet-select").addEventListener("change", (e) => changeSheet(e.target.value));
  $("filter-column").addEventListener("change", (e) => (e.target.value ? openEditor(e.target.value) : closeEditor()));
  $("clear-filters").addEventListener("click", () => setFilters({}));
  $("theme-toggle").addEventListener("click", toggleTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.meta && renderTab());

  const tabs = [...document.querySelectorAll("#tabs [role=tab]")];
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => selectTab(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      selectTab(next.dataset.tab);
    });
  });
}

applyStoredTheme();
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  if (typeof echarts === "undefined") {
    showLoadError(new UserFacingError("グラフ描画ライブラリ（ECharts）を読み込めませんでした。直し方: インターネット接続を確認してページを再読み込みしてください。"));
  }
  engine.start().catch(showLoadError);
});
