import { useState } from "react";
import type { Rule } from "@/lib/types";
import { validateRules } from "@/lib/engine";
export function RuleEditor({
  rules,
  onSave,
}: {
  rules: Rule[];
  onSave: (r: Rule[]) => void;
}) {
  const [editing, setEditing] = useState(rules);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fields = [
    ["id", "基準ID"],
    ["a", "条件A"],
    ["b", "条件B"],
    ["reason", "両立しない理由"],
    ["alignmentPlan", "両立に向けた構成案"],
    ["technology", "技術アプローチ"],
    ["questionHint", "確認質問の観点"],
  ] as const;
  function save() {
    const e = validateRules(editing);
    setError(e);
    if (!e) {
      onSave(editing);
      setSaved(true);
    }
  }
  return (
    <details className="rules-panel">
      <summary>
        <span>
          判定基準表{" "}
          <span className="small ml-3">{rules.length}件の確認観点</span>
        </span>
        <span className="small">閲覧・編集する ＋</span>
      </summary>
      <div className="section-content">
        <p className="mb-2">
          条件内のキーワードをカンマで区切って入力してください。
        </p>
        <p className="small mb-5">
          同一条件のキーワードはすべて一致（AND）。異なる2要件が条件A・Bにそれぞれ一致したときだけ検出します。表記は全角・半角を正規化し、部分一致で照合します。否定や文脈は解釈しません。
        </p>
        <div className="table-scroll">
          <table className="rules-table">
            <thead>
              <tr>
                {fields.map(([k, l]) => (
                  <th key={k}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editing.map((r, i) => (
                <tr key={i}>
                  {fields.map(([k, l]) => (
                    <td key={k} data-label={l}>
                      <textarea
                        aria-label={`${i + 1}行目 ${l}`}
                        value={r[k]}
                        maxLength={1000}
                        onChange={(e) => {
                          setEditing(
                            editing.map((v, j) =>
                              j === i ? { ...v, [k]: e.target.value } : v,
                            ),
                          );
                          setSaved(false);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 mt-5">
          <button
            className="secondary"
            disabled={editing.length >= 50}
            onClick={() => {
              let n = 1;
              while (
                editing.some(
                  (r) => r.id === `RULE-${String(n).padStart(2, "0")}`,
                )
              )
                n++;
              setEditing([
                ...editing,
                {
                  id: `RULE-${String(n).padStart(2, "0")}`,
                  a: "",
                  b: "",
                  reason: "",
                  alignmentPlan: "",
                  technology: "",
                  questionHint: "",
                },
              ]);
              setSaved(false);
            }}
          >
            ＋ 基準を追加
          </button>
          <button className="primary" onClick={save}>
            基準を保存・再照合
          </button>
        </div>
        <p className="small mt-3">
          保存すると、判断と質問文をリセットして再照合します。編集内容はこの画面を開いている間のみ保持されます。
        </p>
        <p role="status" className="small">
          {error || (saved ? "判定基準を保存しました。" : "")}
        </p>
      </div>
    </details>
  );
}
