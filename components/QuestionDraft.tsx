import { useState } from "react";
import type { InputContext } from "@/lib/types";
import { SectionHeading } from "./SectionHeading";
export function QuestionDraft({
  questions,
  count,
  context,
  busy,
  onGenerate,
}: {
  questions: {
    id: string;
    text: string;
  }[];
  count: number;
  context: InputContext;
  busy: boolean;
  onGenerate: () => void;
}) {
  const [copy, setCopy] = useState("");
  async function copyText() {
    try {
      await navigator.clipboard.writeText(
        questions.map((q) => q.text).join("\n\n"),
      );
      setCopy("コピーしました");
    } catch {
      setCopy("コピーできませんでした。本文を選択してコピーしてください。");
    }
  }
  return (
    <section id="questions" className="panel">
      <SectionHeading n="04" title="質問書ドラフト" />
      <div className="section-content">
        <div className="draft-actions">
          <div>
            <p className="font-medium">発注者への確認事項にまとめる</p>
            <p className="small">
              「両立しない」と判断した {count}件だけが対象です。
            </p>
          </div>
          <button
            className="primary"
            disabled={!count || busy}
            onClick={() => {
              setCopy("");
              onGenerate();
            }}
          >
            {busy ? "生成しています…" : "質問文を生成する"}{" "}
            <span aria-hidden>→</span>
          </button>
        </div>
        {questions.length ? (
          <div className="draft-paper">
            <div className="draft-paper-head">
              <div>
                <span className="field-label">
                  {context.documentType}に関する質問事項
                </span>
                <span className="small">確認目的：{context.reviewPurpose}</span>
              </div>
              <button className="secondary" onClick={copyText}>
                コピー
              </button>
            </div>
            {questions.map((q) => (
              <p className="question" key={q.id}>
                {q.text}
              </p>
            ))}
            <p className="small mt-6">
              提出前に、条番号・判断理由・表現を確認してください。
            </p>
            <p role="status" className="small">
              {copy}
            </p>
          </div>
        ) : (
          <div className="empty compact">
            <p>判断から、次の対話へ。</p>
            <span>
              対象を選び「質問文を生成する」を押すと、ここに表示されます。
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
