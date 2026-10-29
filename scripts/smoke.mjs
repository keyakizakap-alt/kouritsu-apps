import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { sample, initialRules } from "../lib/data.ts";
import { extract, detect } from "../lib/engine.ts";
const port = 3099;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
child.stderr.on("data", (d) => (serverLog += String(d)));
child.stdout.on("data", (d) => (serverLog += String(d)));
const base = `http://localhost:${port}`;
const post = async (path, data) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json() };
};
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("startup timeout: " + serverLog)),
      15000,
    );
    child.stdout.on("data", (d) => {
      if (String(d).includes("Ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(Error(`server exited ${code}`));
    });
  });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  const pageCsp = page.headers.get("content-security-policy") || "";
  assert.match(pageCsp, /frame-ancestors 'none'/);
  // ページの CSP は nonce 方式。'unsafe-inline' を使わず、HTML 内のスクリプトには同じ nonce が付く
  const nonce = pageCsp.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, `CSP に nonce がない: ${pageCsp}`);
  assert.doesNotMatch(pageCsp, /'unsafe-inline'|'unsafe-eval'/);
  const html = await page.text();
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(scripts.length > 0, "ページにスクリプトがない");
  for (const tag of scripts)
    assert.ok(
      tag.includes(`nonce="${nonce}"`),
      `nonce のないスクリプト: ${tag}`,
    );
  const second = await fetch(base);
  assert.notEqual(
    (second.headers.get("content-security-policy") || "").match(
      /'nonce-([^']+)'/,
    )?.[1],
    nonce,
    "nonce がリクエストごとに変わっていない",
  );
  const result = await post("/api/extract", { text: sample });
  assert.equal(result.status, 200);
  assert.equal(result.body.requirements.length, 10);
  assert.equal(result.body.mode, "デモモード");
  const pageFallback = await post("/api/extract", {
    text: "【PDF 1ページ】\n庁内ネットワークの分離維持を必須とする。\n外部クラウドとの直接連携を行う。",
  });
  assert.equal(pageFallback.status, 200);
  assert.equal(pageFallback.body.requirements.length, 2);
  assert.equal(pageFallback.body.extractionUnit, "本文・ページ単位");
  assert.equal((await post("/api/extract", { text: "" })).status, 400);
  assert.equal(
    (await post("/api/extract", { text: "a".repeat(100001) })).status,
    400,
  );
  const c = detect(extract(sample), initialRules);
  const decisions = {
    [c[0].id]: { status: "両立しない", reason: "中継区画の設置条件が未記載" },
    [c[1].id]: { status: "構成で対応可", reason: "" },
    [c[2].id]: { status: "保留", reason: "" },
  };
  const q = await post("/api/questions", {
    text: sample,
    rules: initialRules,
    decisions,
  });
  assert.equal(q.status, 200);
  assert.equal(q.body.questions.length, 1);
  assert.ok(q.body.questions[0].text.includes("第3章(2)ア／第3章(2)イ"));
  assert.ok(q.body.questions[0].text.includes("中継区画の設置条件が未記載"));
  assert.ok(!q.body.questions[0].text.includes("第4章"));
  assert.equal(
    (
      await post("/api/questions", {
        text: sample,
        rules: initialRules,
        decisions: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post("/api/questions", {
        text: sample,
        rules: [...initialRules, initialRules[0]],
        decisions,
      })
    ).status,
    400,
  );
  const cross = await fetch(base + "/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://unrelated.invalid",
    },
    body: JSON.stringify({ text: sample }),
  });
  assert.equal(cross.status, 400);
  const form = new FormData();
  form.append("file", new File([sample], "sample.txt", { type: "text/plain" }));
  const documentResult = await fetch(base + "/api/document", {
    method: "POST",
    body: form,
  });
  assert.equal(documentResult.status, 200);
  const documentBody = await documentResult.json();
  assert.equal(documentBody.text, sample);
  assert.match(documentResult.headers.get("cache-control") || "", /no-store/);
  const unsupported = new FormData();
  unsupported.append("file", new File(["data"], "sample.exe"));
  assert.equal(
    (await fetch(base + "/api/document", { method: "POST", body: unsupported }))
      .status,
    400,
  );
  const disguisedPdf = new FormData();
  disguisedPdf.append(
    "file",
    new File(["<html>not a pdf</html>"], "sample.pdf"),
  );
  assert.equal(
    (
      await fetch(base + "/api/document", {
        method: "POST",
        body: disguisedPdf,
      })
    ).status,
    400,
  );
  assert.match(
    documentResult.headers.get("content-security-policy") || "",
    /default-src 'none'/,
  );
  // Content-Length のない（chunked）巨大アップロードも、上限を超えた時点で打ち切る
  let sent = 0;
  const chunk = new Uint8Array(256 * 1024);
  const oversized = await fetch(base + "/api/document", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    duplex: "half",
    body: new ReadableStream({
      pull(controller) {
        if (sent >= 64 * 1024 * 1024) return controller.close();
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    }),
  });
  assert.equal(oversized.status, 400);
  assert.ok(sent < 32 * 1024 * 1024, `上限後も ${sent} バイト読み続けた`);
  // X-Forwarded-For を偽装しても、レート制限の枠は増えない（プロキシを信頼する設定がないため）
  const spoofed = new FormData();
  spoofed.append("file", new File([sample], "sample.txt"));
  const limited = await fetch(base + "/api/document", {
    method: "POST",
    headers: { "X-Forwarded-For": "203.0.113.7" },
    body: spoofed,
  });
  assert.equal(
    limited.status,
    429,
    "X-Forwarded-For の偽装でレート制限を回避できた",
  );
  console.log(
    "PASS: nonce CSP, chunked oversize abort, X-Forwarded-For spoofing does not bypass rate limit, page 200, security headers, no-store APIs, document upload/type-signature rejection, 10 requirements, page fallback, empty/oversize rejection, draft inclusion/exclusion, clauses/reason retained, no-target rejection, duplicate-rule rejection, cross-origin rejection",
  );
} finally {
  child.kill("SIGTERM");
}
