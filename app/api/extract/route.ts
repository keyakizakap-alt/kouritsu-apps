import { extract } from "@/lib/engine";
import { categories } from "@/lib/types";
import { llm, mode, readBody, validText } from "@/lib/server";
import { assertSameSite, rateLimit } from "@/lib/security";
export async function POST(request: Request) {
  try {
    assertSameSite(request);
    const limited = rateLimit(request, "extract", 30);
    if (limited) return limited;
    const body = await readBody(request);
    if (!validText(body.text))
      return Response.json(
        { error: "資料本文は1〜100,000文字で入力してください。" },
        { status: 400 },
      );
    const requirements = extract(body.text);
    if (!requirements.length || requirements.length > 200)
      return Response.json(
        {
          error:
            "本文から要件を抽出できませんでした。内容のある資料を確認してください。",
        },
        { status: 400 },
      );
    if (mode() === "AI接続") {
      const result = (await llm(
        '要件の分類だけを行う。形式は {"categories":["機能",...]}。入力順を維持し、分類は機能／性能／セキュリティ／体制／納期／費用のいずれか。',
        requirements,
      )) as {
        categories: unknown[];
      };
      if (
        !Array.isArray(result.categories) ||
        result.categories.length !== requirements.length ||
        !result.categories.every((x) =>
          categories.includes(x as (typeof categories)[number]),
        )
      )
        throw Error("invalid output");
      requirements.forEach(
        (r, i) =>
          (r.category = result.categories[i] as (typeof categories)[number]),
      );
    }
    return Response.json({
      requirements,
      mode: mode(),
      extractionUnit: requirements.some((r) => r.sourceType === "paragraph")
        ? "本文・ページ単位"
        : "条番号単位",
    });
  } catch {
    return Response.json(
      {
        error:
          "抽出できませんでした。入力形式またはサーバーのAI接続設定を確認して、再試行してください。",
      },
      { status: 400 },
    );
  }
}
