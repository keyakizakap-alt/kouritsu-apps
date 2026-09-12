import "server-only";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM } from "tesseract.js";
import { extractImages, extractTextItems, getDocumentProxy } from "unpdf";

const OCR_PAGE_LIMIT = 12;
const TEXT_THRESHOLD = 24;
const MAX_IMAGE_PIXELS = 25_000_000;

type TextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function joinLine(items: TextItem[]) {
  return items
    .sort((a, b) => a.x - b.x)
    .reduce((line, item) => {
      const value = item.str.trim();
      if (!value) return line;
      const space = /[A-Za-z0-9]$/.test(line) && /^[A-Za-z0-9]/.test(value);
      return line + (space ? " " : "") + value;
    }, "");
}

export function rebuildPdfPage(items: TextItem[]) {
  const sorted = items
    .filter((item) => item.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; height: number; items: TextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.y - item.y) <=
        Math.max(2, Math.min(candidate.height, item.height) * 0.55),
    );
    if (line) line.items.push(item);
    else lines.push({ y: item.y, height: item.height, items: [item] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => joinLine(line.items))
    .filter(Boolean)
    .join("\n");
}

async function pageImage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  page: number,
) {
  const images = await extractImages(pdf, page);
  const image = images
    .filter(
      (item) =>
        item.width >= 500 &&
        item.height >= 500 &&
        item.width * item.height <= MAX_IMAGE_PIXELS,
    )
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!image) return null;
  const raw = Buffer.from(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  );
  return sharp(raw, {
    raw: { width: image.width, height: image.height, channels: image.channels },
  })
    .greyscale()
    .normalise()
    .png()
    .toBuffer();
}

async function createJapaneseWorker() {
  const modules = join(process.cwd(), "node_modules");
  const worker = await createWorker("jpn", OEM.LSTM_ONLY, {
    langPath: join(modules, "@tesseract.js-data/jpn/4.0.0_best_int"),
    workerPath: join(modules, "tesseract.js/src/worker-script/node/index.js"),
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: "1",
  });
  return worker;
}

export async function readPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  if (pdf.numPages > 100) throw Error("pages");
  const extracted = await extractTextItems(pdf);
  const pages = extracted.items.map(rebuildPdfPage);
  const ocrTargets = pages
    .map((text, index) => ({ index, length: text.replace(/\s/g, "").length }))
    .filter((page) => page.length < TEXT_THRESHOLD);
  const targets = ocrTargets.slice(0, OCR_PAGE_LIMIT);
  let ocrPages = 0;
  let worker: Awaited<ReturnType<typeof createJapaneseWorker>> | null = null;
  try {
    for (const target of targets) {
      const image = await pageImage(pdf, target.index + 1);
      if (!image) continue;
      worker ??= await createJapaneseWorker();
      const result = await worker.recognize(image);
      const text = result.data.text.replaceAll("\0", "").trim();
      if (text) {
        pages[target.index] = text;
        ocrPages += 1;
      }
    }
  } finally {
    await worker?.terminate();
  }
  const skippedOcrPages = Math.max(0, ocrTargets.length - targets.length);
  const text = pages
    .map((page, index) => `【PDF ${index + 1}ページ】\n${page}`)
    .join("\n\n")
    .trim();
  return {
    text,
    pages: pdf.numPages,
    ocrPages,
    skippedOcrPages,
    extractionMode:
      ocrPages === 0
        ? "文字データを抽出"
        : ocrPages === pdf.numPages
          ? "日本語OCRで抽出"
          : "文字データ＋日本語OCRで抽出",
  };
}
