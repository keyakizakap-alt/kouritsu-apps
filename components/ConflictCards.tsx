import type { Candidate, Decisions, Decision } from "@/lib/types";
import { SectionHeading } from "./SectionHeading";
import { keywords } from "@/lib/engine";
export function ConflictCards({
  items,
  decisions,
  onDecide,
  ready,
}: {
  items: Candidate[];
  decisions: Decisions;
  onDecide: (id: string, d: Decision) => void;
  ready: boolean;
}) {
  return (
    <section id="conflicts" className="panel">
      <SectionHeading
        n="03"
        title="矛盾候補を確認する"
        human
        count={items.length}
      />
      <div className="scope-note">
        <span aria-hidden>ⓘ</span> この表にある観点のみを確認しています
        <span className="small">候補は矛盾の確定ではありません。</span>
      </div>
      <div className="section-content">
        {!items.length ? (
          <div className="empty">
            <p>
              {ready
                ? "登録された判定基準に該当する組み合わせはありません。"
                : "根拠を確認し、最終判断は人の手で。"}
            </p>
            <span>
              {ready
                ? "仕様書全体の整合性を保証するものではありません。"
                : "抽出後、該当した基準と要件の組み合わせを表示します。"}
            </span>
          </div>
        ) : (
          items.map((c, i) => (
            <article className="conflict-card" key={c.id}>
              <div className="card-top">
                <span className="candidate-label">
                  候補 {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mono">{c.rule.id}</span>
                <span className="ml-auto small">
                  {decisions[c.id]?.status || "未判断"}
                </span>
              </div>
              <div className="pair">
                {[c.a, c.b].map((r, j) => (
                  <div className="pair-item" key={r.id}>
                    <div className="requirement-meta">
                      <span className="pair-letter">{j ? "B" : "A"}</span>
                      <span className="mono">{r.id}</span>
                      <span className="small">{r.clause}</span>
                    </div>
                    <p>{r.text}</p>
                    <div
                      className="mt-4 flex flex-wrap items-center gap-2"
                      aria-label="一致したキーワード"
                    >
                      <span className="small">一致条件</span>
                      {keywords(j ? c.rule.b : c.rule.a).map((word, index) => (
                        <span key={`${word}-${index}`} className="category">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="evidence">
                <div>
                  <span className="field-label">
                    両立しない可能性がある理由
                  </span>
                  <p>{c.rule.reason}</p>
                </div>
              </div>
              <div className="ai-guidance">
                <div className="ai-guidance-head">
                  <div>
                    <span className="badge">AI担当</span>
                    <strong>対応の選択肢</strong>
                  </div>
                  <span className="small">要件確定・設計検証前の提案です</span>
                </div>
                <div className="guidance-grid">
                  <div className="guidance-item">
                    <span className="guidance-number">01</span>
                    <span className="field-label">両立に向けた構成案</span>
                    <p>{c.rule.alignmentPlan}</p>
                  </div>
                  <div className="guidance-item">
                    <span className="guidance-number">02</span>
                    <span className="field-label">適用できる技術</span>
                    <p>{c.rule.technology}</p>
                  </div>
                  <div className="guidance-item recommended-question">
                    <span className="guidance-number">03</span>
                    <span className="field-label">発注者へ推奨する質問</span>
                    <p>
                      <span className="mono">
                        {c.a.clause}／{c.b.clause}
                      </span>
                      <br />
                      {c.rule.questionHint}
                    </p>
                  </div>
                </div>
              </div>
              <div className="decision-area">
                <div
                  className="decision-buttons"
                  role="group"
                  aria-label={`候補${i + 1}の判断`}
                >
                  {(["両立しない", "構成で対応可", "保留"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        aria-pressed={decisions[c.id]?.status === status}
                        className={
                          decisions[c.id]?.status === status
                            ? "decision selected"
                            : "decision"
                        }
                        onClick={() =>
                          onDecide(c.id, {
                            status,
                            reason: decisions[c.id]?.reason || "",
                          })
                        }
                      >
                        {decisions[c.id]?.status === status ? "✓ " : ""}
                        {status}
                      </button>
                    ),
                  )}
                </div>
                {decisions[c.id] && (
                  <label className="reason-label">
                    判断理由
                    <textarea
                      maxLength={2000}
                      value={decisions[c.id].reason}
                      placeholder="判断の根拠や、確認すべき条件を記載してください。"
                      onChange={(e) =>
                        onDecide(c.id, {
                          ...decisions[c.id],
                          reason: e.target.value,
                        })
                      }
                    />
                  </label>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
