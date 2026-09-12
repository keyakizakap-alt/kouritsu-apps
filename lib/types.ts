export const categories = [
  "機能",
  "性能",
  "セキュリティ",
  "体制",
  "納期",
  "費用",
] as const;
export type Category = (typeof categories)[number];
export type Requirement = {
  id: string;
  clause: string;
  text: string;
  category: Category;
  line: number;
  page?: number;
  sourceType?: "clause" | "paragraph";
};
export type Rule = {
  id: string;
  a: string;
  b: string;
  reason: string;
  alignmentPlan: string;
  technology: string;
  questionHint: string;
};
export type Candidate = {
  id: string;
  a: Requirement;
  b: Requirement;
  rule: Rule;
};
export type Decision = {
  status: "両立しない" | "構成で対応可" | "保留";
  reason: string;
};
export type Decisions = Record<string, Decision>;
export type InputContext = {
  documentType: string;
  reviewPurpose: string;
  comment: string;
};
