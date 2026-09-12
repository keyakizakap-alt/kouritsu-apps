"use client";
import { useState, useMemo } from "react";
import { InputSection, type UploadedFile } from "./InputSection";
import { RequirementsTable } from "./RequirementsTable";
import { ConflictCards } from "./ConflictCards";
import { QuestionDraft } from "./QuestionDraft";
import { RuleEditor } from "./RuleEditor";
import { initialRules, sample } from "@/lib/data";
import { detect, selected } from "@/lib/engine";
import type {
  Requirement,
  Rule,
  Decisions,
  Decision,
  InputContext,
} from "@/lib/types";
export function Workspace({ initialMode }: { initialMode: string }) {
  const [text, setText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile>(null);
  const [context, setContext] = useState<InputContext>({
    documentType: "仕様書",
    reviewPurpose: "全体の整合性を確認",
    comment: "",
  });
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [questions, setQuestions] = useState<
    {
      id: string;
      text: string;
    }[]
  >([]);
  const [busy, setBusy] = useState<"upload" | "extract" | "questions" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const candidates = useMemo(() => detect(reqs, rules), [reqs, rules]);
  const targets = selected(candidates, decisions);
  const judged = candidates.filter((c) => decisions[c.id]).length;
  function changeText(value: string) {
    setText(value);
    setUploadedFile(null);
    setReqs([]);
    setDecisions({});
    setQuestions([]);
    setError("");
    setNotice("");
  }
  function resetResults() {
    setReqs([]);
    setDecisions({});
    setQuestions([]);
    setError("");
  }
  async function uploadDocument(file: File) {
    setBusy("upload");
    resetResults();
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/document", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || "文書を読み取れませんでした。");
      setText(data.text);
      setUploadedFile({
        name: data.fileName,
        size: data.size,
        truncated: data.truncated,
        extractionMode: data.extractionMode,
        pages: data.pages,
        ocrPages: data.ocrPages,
        skippedOcrPages: data.skippedOcrPages,
      });
      const ocrWarning = data.skippedOcrPages
        ? ` OCR対象のうち${data.skippedOcrPages}ページは処理上限のため未抽出です。PDFを分割すると確認できます。`
        : "";
      setNotice(
        `${data.fileName}を読み込みました。${data.extractionMode || "本文を抽出"}。条件を選んで要件抽出を開始できます。${ocrWarning}`,
      );
    } catch (e) {
      setText("");
      setUploadedFile(null);
      setError(e instanceof Error ? e.message : "文書を読み取れませんでした。");
    } finally {
      setBusy(null);
    }
  }
  async function request(path: string, payload: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || "処理できませんでした。");
    return data;
  }
  async function runExtract() {
    setBusy("extract");
    setError("");
    setNotice("");
    setQuestions([]);
    setDecisions({});
    try {
      const data = await request("/api/extract", { text });
      setReqs(data.requirements);
      const found = detect(data.requirements, rules);
      setNotice(
        `${data.extractionUnit || "条番号単位"}で${data.requirements.length}件を抽出し、${found.length}組の矛盾候補を検出しました。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "抽出できませんでした。");
    } finally {
      setBusy(null);
    }
  }
  function decide(id: string, d: Decision) {
    setDecisions({ ...decisions, [id]: d });
    setQuestions([]);
    setNotice("");
  }
  function changeContext(next: InputContext) {
    setContext(next);
    setQuestions([]);
  }
  async function generate() {
    setBusy("questions");
    setError("");
    try {
      const data = await request("/api/questions", {
        text,
        rules,
        decisions,
        context,
      });
      setQuestions(data.questions);
      setNotice(`${data.questions.length}件の質問文を生成しました。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成できませんでした。");
    } finally {
      setBusy(null);
    }
  }
  function saveRules(next: Rule[]) {
    setRules(next);
    setDecisions({});
    setQuestions([]);
    setNotice("判定基準を更新し、再照合しました。");
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#input">
          <span className="brand-mark" aria-hidden>
            ≡
          </span>
          <span>要件整合レビュー</span>
        </a>
        <span className="header-label">公共提案ワークスペース</span>
        <span className="demo-pill">架空案件 / {initialMode}</span>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">仕様書レビュー</p>
            <h1>
              要件の間にある、
              <br className="mobile-break" />
              見落としを確かめる。
            </h1>
            <p className="intro-description">
              原文を根拠に、基準で照合。人の判断を、質問書につなげます。
            </p>
          </div>
          <div className="intro-side">
            <span className="field-label">確認の範囲</span>
            <strong>判定基準 {rules.length}件</strong>
            <span className="small">自由推論による矛盾検出なし</span>
          </div>
        </div>
        <nav className="flow" aria-label="作業の進行状況">
          {[
            {
              name: "要件抽出",
              value: reqs.length,
              unit: "件",
              href: "#requirements",
            },
            {
              name: "基準に該当",
              value: candidates.length,
              unit: "組",
              href: "#conflicts",
            },
            {
              name: "人の判断",
              value: judged,
              unit: `/ ${candidates.length}組`,
              href: "#conflicts",
            },
            {
              name: "質問書の対象",
              value: targets.length,
              unit: "件",
              href: "#questions",
            },
          ].map((s, i) => (
            <a
              key={s.name}
              href={s.href}
              className={
                i === 1 && candidates.length
                  ? "flow-item highlight"
                  : "flow-item"
              }
            >
              <span className="flow-label">
                <span className="small">0{i + 1}</span>
                {s.name}
              </span>
              <span className="flow-value">
                {String(s.value).padStart(2, "0")}
                <span>{s.unit}</span>
              </span>
            </a>
          ))}
        </nav>
        <p className="mode-note">
          {initialMode === "デモモード"
            ? "デモモード：外部AIへの送信はありません。固定ルールで抽出・分類し、定型文で質問を作成します。"
            : "AI接続：抽出した要件の分類と質問文の整形を、サーバー経由で外部AIに依頼します。"}
        </p>
        <div aria-live="polite">
          {notice && <div className="notice">✓ {notice}</div>}
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
        </div>
        <fieldset disabled={busy !== null} className="workspace-fieldset">
          <InputSection
            text={text}
            context={context}
            uploadedFile={uploadedFile}
            onChange={changeText}
            onContextChange={changeContext}
            onFile={uploadDocument}
            onRemoveFile={() => changeText("")}
            onSample={() => {
              changeText(sample);
              setUploadedFile({
                name: "A市_庁内業務支援システム構築仕様書.txt",
                size: new Blob([sample]).size,
                truncated: false,
              });
              setContext({
                documentType: "仕様書",
                reviewPurpose: "全体の整合性を確認",
                comment: "",
              });
              setNotice(
                "架空のA市仕様書を読み込みました。「要件を抽出する」で確認を開始できます。",
              );
            }}
            onExtract={runExtract}
            busy={busy === "extract"}
            uploading={busy === "upload"}
          />
          <RequirementsTable items={reqs} />
          <ConflictCards
            items={candidates}
            decisions={decisions}
            onDecide={decide}
            ready={reqs.length > 0}
          />
        </fieldset>
        <QuestionDraft
          questions={questions}
          count={targets.length}
          context={context}
          busy={busy !== null}
          onGenerate={generate}
        />
        <fieldset className="workspace-fieldset" disabled={busy !== null}>
          <RuleEditor rules={rules} onSave={saveRules} />
        </fieldset>
        <footer>
          <span>すべての案件・組織・判定基準は架空の設定です。</span>
          <span>入力・判断は画面を閉じると消去されます。</span>
        </footer>
      </main>
    </>
  );
}
