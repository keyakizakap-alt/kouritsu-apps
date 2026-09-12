import type { Requirement } from "@/lib/types";
import { SectionHeading } from "./SectionHeading";
import { ExpandableText } from "./ExpandableText";
export function RequirementsTable({ items }: { items: Requirement[] }) {
  return (
    <section id="requirements" className="panel">
      <SectionHeading n="02" title="抽出された要件" count={items.length} />
      {items.length ? (
        <div className="table-scroll">
          <table className="requirements-table">
            <thead>
              <tr>
                <th>要件ID</th>
                <th>条番号</th>
                <th>要件本文（原文）</th>
                <th>分類</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td data-label="要件ID">
                    <span className="mono">{r.id}</span>
                  </td>
                  <td data-label="条番号" className="requirement-clause">
                    {r.clause}
                    <span className="block small">
                      {r.page ? `PDF ${r.page}ページ` : `原文 ${r.line}行目`}
                    </span>
                  </td>
                  <td data-label="要件本文" className="requirement-text">
                    <ExpandableText text={r.text} />
                  </td>
                  <td data-label="分類">
                    <span className="category">{r.category}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <span className="empty-symbol">≡</span>
          <p>仕様書から、確認の起点をつくる。</p>
          <span>
            条番号、またはPDFのページ位置を保った要件がここに並びます。
          </span>
        </div>
      )}
    </section>
  );
}
