import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extract,
  detect,
  draft,
  selected,
  validateRules,
} from "../lib/engine.ts";
import { initialRules, sample } from "../lib/data.ts";
import { hasExpectedSignature, rateLimit } from "../lib/security.ts";
test("sample preserves all ten clauses and finds exactly five documented pairs", () => {
  const requirements = extract(sample);
  assert.equal(requirements.length, 10);
  assert.equal(requirements[0].clause, "第3章(2)ア");
  for (const r of requirements)
    assert.ok(sample.split("\n")[r.line - 1].endsWith(r.text));
  assert.deepEqual(
    detect(requirements, initialRules).map((c) => c.rule.id),
    initialRules.slice(0, 5).map((r) => r.id),
  );
});
test("the same document always produces the same candidates", () => {
  const expected = detect(extract(sample), initialRules);
  for (let i = 0; i < 30; i++)
    assert.deepEqual(detect(extract(sample), initialRules), expected);
});
test("unregistered pairs and incomplete keyword conditions do not match", () => {
  assert.equal(detect(extract(sample), []).length, 0);
  const rules = [{ ...initialRules[0], a: "庁内ネットワーク,存在しない条件" }];
  assert.equal(detect(extract(sample), rules).length, 0);
});
test("swapped A/B order works and a single requirement cannot conflict with itself", () => {
  const reqs = extract(sample).slice(0, 2);
  assert.equal(detect([...reqs].reverse(), initialRules).length, 1);
  assert.equal(
    detect(
      [{ ...reqs[0], text: reqs.map((r) => r.text).join("") }],
      initialRules,
    ).length,
    0,
  );
});
test("only incompatible decisions enter the question draft", () => {
  const c = detect(extract(sample), initialRules);
  const d = {
    [c[0].id]: { status: "両立しない" as const, reason: "確認が必要" },
    [c[1].id]: { status: "構成で対応可" as const, reason: "" },
    [c[2].id]: { status: "保留" as const, reason: "" },
  };
  assert.deepEqual(
    selected(c, d).map((x) => x.id),
    [c[0].id],
  );
});
test("nested clause headings retain their source position", () => {
  const reqs = extract(
    "第3章\n(2)\nウ 外部クラウドとの直接連携を行う。\n続きの要件本文。",
  );
  assert.deepEqual(
    reqs.map((r) => r.clause),
    ["第3章(2)ウ"],
  );
  assert.equal(reqs[0].line, 3);
  assert.match(reqs[0].text, /続きの要件本文/);
});
test("spaced headings and PDF page markers retain their source position", () => {
  const reqs = extract(
    "【PDF 2ページ】\n第3章 第2節 （2） ア 外部連携を行う。\n補足条件を適用する。",
  );
  assert.equal(reqs[0].clause, "第3章第2節（2）ア");
  assert.equal(reqs[0].page, 2);
  assert.match(reqs[0].text, /補足条件/);
});
test("documents without clause numbers fall back to page-aware paragraphs", () => {
  const reqs = extract(
    "【PDF 1ページ】\n庁内ネットワークの分離維持を必須とする。\n外部クラウドとの直接連携を行う。",
  );
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].clause, "PDF 1ページ（本文1）");
  assert.equal(reqs[0].sourceType, "paragraph");
  assert.equal(detect(reqs, initialRules)[0].rule.id, "RULE-01");
});
test("the five additional public-system criteria are deterministic", () => {
  const requirements = extract(`第8章(1)ア 障害発生時は即時復旧すること。
第8章(1)イ バックアップは日次で取得すること。
第9章(1)ア 既存端末の全てで利用できること。
第9章(1)イ 最新ブラウザに限定して提供すること。
第10章(1)ア 記録は10年間保存すること。
第10章(1)イ 利用終了時に即時削除すること。
第11章(1)ア 問い合わせは24時間365日受け付けること。
第11章(1)イ サポートは平日の営業時間に提供すること。
第12章(1)ア データは庁内保管とすること。
第12章(1)イ 保守員は庁外から直接操作できること。`);
  assert.deepEqual(
    detect(requirements, initialRules).map((candidate) => candidate.rule.id),
    ["RULE-06", "RULE-07", "RULE-08", "RULE-09", "RULE-10"],
  );
});
test("duplicate IDs and empty conditions are rejected", () => {
  assert.ok(validateRules([...initialRules, initialRules[0]]));
  assert.ok(validateRules([{ ...initialRules[0], a: " , " }]));
});
test("draft keeps the rule-based configuration, technology, and question hint", () => {
  const candidate = detect(extract(sample), initialRules)[0];
  const text = draft(candidate, "設計条件が未確定");
  assert.ok(text.includes(candidate.rule.alignmentPlan));
  assert.ok(text.includes(candidate.rule.technology));
  assert.ok(text.includes(candidate.rule.questionHint));
});
test("uploaded binary documents require their expected signatures", () => {
  assert.equal(
    hasExpectedSignature("pdf", new TextEncoder().encode("%PDF-1.7")),
    true,
  );
  assert.equal(
    hasExpectedSignature("pdf", new TextEncoder().encode("<html>")),
    false,
  );
  assert.equal(
    hasExpectedSignature("docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
    true,
  );
});
test("API rate limiter returns retry guidance after the configured limit", async () => {
  const request = new Request("https://example.invalid/api/test", {
    headers: { "x-vercel-forwarded-for": "192.0.2.10" },
  });
  assert.equal(rateLimit(request, "unit-test", 2), null);
  assert.equal(rateLimit(request, "unit-test", 2), null);
  const blocked = rateLimit(request, "unit-test", 2);
  assert.equal(blocked?.status, 429);
  assert.ok(blocked?.headers.get("retry-after"));
  assert.match(JSON.stringify(await blocked?.json()), /再試行/);
});
