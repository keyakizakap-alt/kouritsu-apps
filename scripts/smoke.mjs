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
  assert.match(
    page.headers.get("content-security-policy") || "",
    /frame-ancestors 'none'/,
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
  console.log(
    "PASS: page 200, security headers, no-store APIs, document upload/type-signature rejection, 10 requirements, page fallback, empty/oversize rejection, draft inclusion/exclusion, clauses/reason retained, no-target rejection, duplicate-rule rejection, cross-origin rejection",
  );
} finally {
  child.kill("SIGTERM");
}
