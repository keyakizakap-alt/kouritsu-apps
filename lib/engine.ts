import type {
  Candidate,
  Requirement,
  Rule,
  Category,
  Decisions,
} from "./types";
const classify = (s: string): Category =>
  /費|課金/.test(s)
    ? "費用"
    : /試験|稼働開始|納期/.test(s)
      ? "納期"
      : /個人情報|ネットワーク|分離/.test(s)
        ? "セキュリティ"
        : /保守|体制/.test(s)
          ? "体制"
          : /無停止|性能/.test(s)
            ? "性能"
            : "機能";
// Original text is never normalized. Normalization is only used for matching.
export function extract(text: string): Requirement[] {
  let chapter = "",
    section = "",
    item = "",
    clause = "",
    page: number | undefined;
  const result: Requirement[] = [];
  const prepared = text
    .replace(/\f/g, "\n")
    .replace(
      /([。．！？])\s*(?=第[0-9０-９一二三四五六七八九十百]+[章条])/g,
      "$1\n",
    );
  prepared.split(/\r?\n/).forEach((raw, index) => {
    const s = raw.trim();
    if (!s) return;
    const pageMarker = s.match(/^【PDF\s+(\d+)ページ】$/);
    if (pageMarker) {
      page = Number(pageMarker[1]);
      return;
    }
    const full = s.match(
      /^(第[0-9０-９一二三四五六七八九十百]+[章条])(?:[\s　]*(第[0-9０-９一二三四五六七八九十百]+節))?(?:[\s　]*([（(][0-9０-９]+[)）]))?(?:[\s　]*([ア-ン]))?(?:[\s　：:、．.]*)?(.*)$/,
    );
    const sub = s.match(/^([（(][0-9０-９]+[)）])([ア-ン])?(?:[\s　]+)?(.*)$/);
    const kana = s.match(/^([ア-ン])[\s　]+(.*)$/);
    const numeric = s.match(
      /^((?:[0-9０-９]+[.．-])+[0-9０-９]+|[0-9０-９]+[.．])(?:[\s　]+)(.*)$/,
    );
    let body = s;
    if (full) {
      chapter = full[1];
      section = full[2] || "";
      item = full[3] || "";
      clause = chapter + section + item + (full[4] || "");
      body = full[5];
    } else if (sub) {
      item = sub[1];
      clause = chapter + section + item + (sub[2] || "");
      body = sub[3];
    } else if (kana && chapter) {
      clause = chapter + section + item + kana[1];
      body = kana[2];
    } else if (numeric) {
      clause = numeric[1];
      body = numeric[2];
    } else if (!clause) return;
    else if (result.length) {
      const previous = result[result.length - 1];
      previous.text = `${previous.text} ${s}`.trim();
      previous.category = classify(previous.text);
      return;
    }
    if (!body.trim()) return;
    result.push({
      id: `REQ-${String(result.length + 1).padStart(2, "0")}`,
      clause,
      text: body,
      category: classify(body),
      line: index + 1,
      page,
      sourceType: "clause",
    });
  });
  return result.length ? result : extractParagraphs(text);
}

function extractParagraphs(text: string): Requirement[] {
  const result: Requirement[] = [];
  let page: number | undefined;
  let paragraph = 0;
  const add = (value: string, line: number) => {
    const body = value.trim();
    if (body.replace(/\s/g, "").length < 8 || result.length >= 200) return;
    paragraph += 1;
    result.push({
      id: `REQ-${String(result.length + 1).padStart(2, "0")}`,
      clause: page
        ? `PDF ${page}ページ（本文${paragraph}）`
        : `本文${paragraph}`,
      text: body,
      category: classify(body),
      line,
      page,
      sourceType: "paragraph",
    });
  };
  text
    .replace(/\f/g, "\n")
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const value = raw.trim();
      const marker = value.match(/^【PDF\s+(\d+)ページ】$/);
      if (marker) {
        page = Number(marker[1]);
        paragraph = 0;
        return;
      }
      if (!value) return;
      const sentences = value.match(/[^。！？]+[。！？]?/g) || [value];
      sentences.forEach((sentence) => add(sentence, index + 1));
    });
  return result;
}
export const keywords = (s: string) =>
  s
    .split(/[,、\n]/)
    .map((x) => x.normalize("NFKC").trim())
    .filter(Boolean);
function matches(text: string, condition: string) {
  const ks = keywords(condition);
  return ks.length > 0 && ks.every((k) => text.normalize("NFKC").includes(k));
}
export function detect(reqs: Requirement[], rules: Rule[]): Candidate[] {
  const out: Candidate[] = [];
  for (const rule of rules) {
    const aMatches = reqs.map((r) => matches(r.text, rule.a));
    const bMatches = reqs.map((r) => matches(r.text, rule.b));
    for (let i = 0; i < reqs.length; i++)
      for (let j = i + 1; j < reqs.length; j++) {
        const x = reqs[i],
          y = reqs[j];
        const forward = aMatches[i] && bMatches[j];
        if (forward || (aMatches[j] && bMatches[i]))
          out.push({
            id: `${rule.id}:${x.id}:${y.id}`,
            a: forward ? x : y,
            b: forward ? y : x,
            rule,
          });
      }
  }
  return out;
}
export function draft(c: Candidate, reason: string, comment = "") {
  return `${comment.trim() ? `確認の背景として「${comment.trim()}」がございます。` : ""}「${c.a.text}」と「${c.b.text}」について、${c.rule.reason} 両要件の適用範囲と優先順位をご教示ください。${reason.trim() ? `当方では「${reason.trim()}」と整理しております。` : ""} 当方では、両立に向けた構成案として、${c.rule.alignmentPlan}${c.rule.technology}の適用を候補としております。${c.rule.questionHint}`;
}
export function selected(c: Candidate[], d: Decisions) {
  return c.filter((x) => d[x.id]?.status === "両立しない");
}
export function validateRules(rules: Rule[]) {
  if (!rules.length || rules.length > 50)
    return "基準は1〜50件で設定してください。";
  const ids = new Set<string>();
  for (const r of rules) {
    if (!/^RULE-\d{2,}$/.test(r.id) || ids.has(r.id))
      return "基準IDは重複しない RULE-01 形式で入力してください。";
    ids.add(r.id);
    if (
      !keywords(r.a).length ||
      !keywords(r.b).length ||
      !r.reason.trim() ||
      !r.alignmentPlan.trim() ||
      !r.technology.trim() ||
      !r.questionHint.trim()
    )
      return "判定基準のすべての項目を入力してください。";
  }
  return "";
}
