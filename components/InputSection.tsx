import { useRef, useState } from "react";
import type { InputContext } from "@/lib/types";
import { SectionHeading } from "./SectionHeading";

const documentTypes = [
  "仕様書",
  "要件定義書",
  "提案依頼書",
  "運用・保守資料",
  "議事録・照会回答",
  "その他",
];
const reviewPurposes = [
  "全体の整合性を確認",
  "セキュリティ条件を重点確認",
  "体制・納期を重点確認",
  "費用条件を重点確認",
];
export type UploadedFile = {
  name: string;
  size: number;
  truncated: boolean;
  extractionMode?: string;
  pages?: number;
  ocrPages?: number;
  skippedOcrPages?: number;
} | null;

export function InputSection({
  text,
  context,
  uploadedFile,
  onChange,
  onContextChange,
  onFile,
  onRemoveFile,
  onSample,
  onExtract,
  busy,
  uploading,
}: {
  text: string;
  context: InputContext;
  uploadedFile: UploadedFile;
  onChange: (v: string) => void;
  onContextChange: (v: InputContext) => void;
  onFile: (file: File) => void;
  onRemoveFile: () => void;
  onSample: () => void;
  onExtract: () => void;
  busy: boolean;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function choose(files: FileList | null) {
    if (files?.[0]) onFile(files[0]);
  }
  return (
    <section id="input" className="panel">
      <SectionHeading n="01" title="確認する資料を追加する" />
      <div className="section-content">
        <div className="intake-grid">
          <div>
            <span className="input-kicker">1. ドキュメント</span>
            <div
              className={`upload-zone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                choose(e.dataTransfer.files);
              }}
            >
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json"
                onChange={(e) => choose(e.target.files)}
                disabled={busy || uploading}
              />
              {uploadedFile ? (
                <div className="uploaded-file">
                  <span className="file-icon" aria-hidden>
                    ✓
                  </span>
                  <div>
                    <strong>{uploadedFile.name}</strong>
                    <span>
                      {(uploadedFile.size / 1024).toFixed(0)}KB・本文
                      {text.length.toLocaleString()}文字を読み込み済み
                    </span>
                    {uploadedFile.extractionMode && (
                      <span>
                        {uploadedFile.extractionMode}
                        {uploadedFile.pages
                          ? `・${uploadedFile.pages}ページ`
                          : ""}
                      </span>
                    )}
                  </div>
                  <button className="remove-file" onClick={onRemoveFile}>
                    取り消す
                  </button>
                </div>
              ) : (
                <>
                  <span className="upload-icon" aria-hidden>
                    ⇧
                  </span>
                  <p>
                    {uploading
                      ? "文書を読み取っています…"
                      : "ここに資料をドロップ"}
                  </p>
                  <span className="small">または</span>
                  <button
                    className="secondary"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy || uploading}
                  >
                    ファイルを選ぶ
                  </button>
                  <span className="small">
                    PDF（画像PDFはOCR）・Word・Excel・テキスト系／5MBまで
                  </span>
                </>
              )}
            </div>
            <button
              className="sample-button"
              onClick={onSample}
              disabled={busy || uploading}
            >
              <span aria-hidden>▤</span>
              <span>架空のA市サンプルで試す</span>
              <span aria-hidden>→</span>
            </button>
          </div>
          <div className="intake-options">
            <span className="input-kicker">2. 確認の条件</span>
            <label>
              資料の種類
              <select
                value={context.documentType}
                onChange={(e) =>
                  onContextChange({ ...context, documentType: e.target.value })
                }
              >
                {documentTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              確認したいこと
              <select
                value={context.reviewPurpose}
                onChange={(e) =>
                  onContextChange({ ...context, reviewPurpose: e.target.value })
                }
              >
                {reviewPurposes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <span className="small option-help">
                選択内容は質問書に表示します。照合は判定基準すべてが対象です。
              </span>
            </label>
            <label>
              補足コメント <span className="optional">任意</span>
              <textarea
                className="comment-input"
                value={context.comment}
                maxLength={300}
                onChange={(e) =>
                  onContextChange({ ...context, comment: e.target.value })
                }
                placeholder="例：ネットワーク分離とクラウド連携の条件を優先して確認したい"
              />
              <span className="small comment-count">
                {context.comment.length}/300
              </span>
            </label>
          </div>
        </div>
        <details
          className="direct-entry"
          open={!uploadedFile && text.length > 0}
        >
          <summary>本文を直接貼り付ける</summary>
          <textarea
            id="spec"
            className="spec-input"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            maxLength={100000}
            disabled={busy || uploading}
            placeholder={
              "条番号を含む本文を貼り付けてください。\n\n第3章(2)ア 庁内ネットワークは分離維持を必須とする。"
            }
          />
        </details>
        <div className="input-footer">
          <div className="ready-state">
            <span className={text.trim() ? "ready-dot active" : "ready-dot"} />
            <div>
              <p>
                {text.trim() ? "確認を開始できます" : "資料を追加してください"}
              </p>
              <span className="small">
                {text.length.toLocaleString()} / 100,000文字
                {uploadedFile?.truncated ? "（上限まで読み込み）" : ""}
              </span>
            </div>
          </div>
          <button
            className="primary extract-button"
            onClick={onExtract}
            disabled={busy || uploading || !text.trim()}
          >
            {busy ? "要件を抽出しています…" : "この資料から要件を抽出"}
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
