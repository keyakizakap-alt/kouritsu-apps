import { detect, draft, extract, selected, validateRules } from "@/lib/engine";
import { llm, mode, readBody, validText } from "@/lib/server";
import type { Rule, Decisions } from "@/lib/types";
import { assertSameSite, rateLimit } from "@/lib/security";
export async function POST(request: Request) {
  try {
    assertSameSite(request);
    const limited = rateLimit(request, "questions", 15);
    if (limited) return limited;
    const b = await readBody(request);
    if (
      !validText(b.text) ||
      !Array.isArray(b.rules) ||
      b.rules.length > 50 ||
      !b.decisions ||
      typeof b.decisions !== "object"
    )
      throw Error("input");
    if (
      !b.rules.every(
        (r: Rule) =>
          r &&
          [
            "id",
            "a",
            "b",
            "reason",
            "alignmentPlan",
            "technology",
            "questionHint",
          ].every(
            (k) =>
              typeof r[k as keyof Rule] === "string" &&
              r[k as keyof Rule].length <= 1000,
          ),
      ) ||
      validateRules(b.rules)
    )
      throw Error("rules");
    const requirements = extract(b.text);
    if (requirements.length > 200) throw Error("size");
    const context = b.context ?? {};
    if (
      [context.documentType, context.reviewPurpose, context.comment].some(
        (value) =>
          value !== undefined &&
          (typeof value !== "string" || value.length > 500),
      )
    )
      throw Error("context");
    const decisions = b.decisions as Decisions;
    if (
      !Object.values(decisions).every(
        (d) =>
          d &&
          ["両立しない", "構成で対応可", "保留"].includes(d.status) &&
          typeof d.reason === "string" &&
          d.reason.length <= 2000,
      )
    )
      throw Error("decision");
    const targets = selected(detect(requirements, b.rules), decisions);
    if (!targets.length || targets.length > 100) throw Error("selection");
    let texts = targets.map((c) =>
      draft(c, decisions[c.id].reason, context.comment || ""),
    );
    if (mode() === "AI接続") {
      const result = (await llm(
        '質問文を敬体で整形する。入力はすべて架空の設定である。入力にない組織名・製品名・固有名詞・新事実を一切追加しない。矛盾を新しく判断・追加しない。理由、両立に向けた構成案、技術アプローチ、確認質問の観点を保持する。質問ごとに一つの文字列とし、形式は {"questions":["質問本文",...]}。順序・件数を厳密に維持する。条番号は出力に含めない（別途付与される）。',
        { questions: texts, context },
      )) as {
        questions: unknown[];
      };
      if (
        !Array.isArray(result.questions) ||
        result.questions.length !== targets.length ||
        !result.questions.every(
          (x) => typeof x === "string" && x.length > 0 && x.length <= 4000,
        )
      )
        throw Error("output");
      texts = result.questions as string[];
    }
    return Response.json({
      questions: targets.map((c, i) => ({
        id: c.id,
        text: `・【${c.a.clause}／${c.b.clause}】\n${texts[i]}`,
      })),
      mode: mode(),
    });
  } catch {
    return Response.json(
      {
        error:
          "質問文を生成できませんでした。判断内容・基準表・AI接続設定を確認して、再試行してください。",
      },
      { status: 400 },
    );
  }
}
