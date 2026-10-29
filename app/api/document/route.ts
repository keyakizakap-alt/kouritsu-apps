import mammoth from "mammoth";
import readExcelFile from "read-excel-file/node";
import { readPdf } from "@/lib/pdf";
import {
  acquireSlot,
  assertSafeZip,
  assertSameSite,
  hasExpectedSignature,
  rateLimit,
  readLimitedBody,
} from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
// multipart の境界や項目名の分を含めた、リクエスト本文の上限
const MAX_BODY_BYTES = MAX_FILE_BYTES + 512_000;
// OCR は CPU とメモリを多く使うため、全体での同時実行数を絞る
const MAX_CONCURRENT = 2;
const MAX_TEXT_LENGTH = 100_000;
const allowed = new Set(["pdf", "docx", "xlsx", "txt", "md", "csv", "json"]);

function extension(name: string) {
  return name.toLowerCase().split(".").pop() || "";
}

function cellText(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value);
}

export async function POST(request: Request) {
  let release = () => {};
  try {
    assertSameSite(request);
    const limited = rateLimit(request, "document", 4);
    if (limited) return limited;
    const slot = acquireSlot("document", MAX_CONCURRENT);
    if (slot.response) return slot.response;
    release = slot.release;
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data"))
      throw Error("content-type");
    // request.formData() は本文を上限なしで読み込むため、先に上限つきで読んでから解析する
    const body = await readLimitedBody(request, MAX_BODY_BYTES);
    const form = await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES)
      throw Error("file");
    const ext = extension(file.name);
    if (!allowed.has(ext)) throw Error("type");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedSignature(ext, bytes)) throw Error("signature");
    if (ext === "docx" || ext === "xlsx") assertSafeZip(bytes);
    let text = "";
    let extractionMode = "テキストを抽出";
    let pages: number | undefined;
    let ocrPages = 0;
    let skippedOcrPages = 0;
    if (["txt", "md", "csv", "json"].includes(ext)) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      text = result.value;
    } else if (ext === "xlsx") {
      const sheets = await readExcelFile(Buffer.from(bytes));
      text = sheets
        .slice(0, 20)
        .map(
          ({ sheet, data }) =>
            `【シート：${sheet}】\n` +
            data
              .slice(0, 5000)
              .map((row) => row.map(cellText).join("\t"))
              .join("\n"),
        )
        .join("\n\n");
    } else {
      const result = await readPdf(bytes);
      text = result.text;
      extractionMode = result.extractionMode;
      pages = result.pages;
      ocrPages = result.ocrPages;
      skippedOcrPages = result.skippedOcrPages;
    }
    text = text.replaceAll("\0", "").trim();
    if (!text.replace(/【PDF\s+\d+ページ】/g, "").trim()) throw Error("empty");
    const truncated = text.length > MAX_TEXT_LENGTH;
    return Response.json({
      text: text.slice(0, MAX_TEXT_LENGTH),
      fileName: file.name.slice(0, 180),
      size: file.size,
      truncated,
      extractionMode,
      pages,
      ocrPages,
      skippedOcrPages,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const message =
      detail === "pages"
        ? "PDFは100ページ以下に分割してアップロードしてください。"
        : /password/i.test(detail)
          ? "パスワード保護されたPDFは解除してからアップロードしてください。"
          : "文書を読み取れませんでした。破損や特殊な暗号化がないか確認してください。";
    return Response.json(
      {
        error: `${message} 5MB以下のPDF・DOCX・XLSX・TXT・MD・CSV・JSONに対応しています。`,
      },
      { status: 400 },
    );
  } finally {
    release();
  }
}
