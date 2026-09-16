/** Preserve readable pages when one scanned page cannot be recognized. */
export async function recoverPdfPages(
  sourcePages: string[],
  recognize: (page: number) => Promise<string | null>,
  limit = 12,
) {
  const pages = [...sourcePages];
  const targets = pages.flatMap((text, index) =>
    text.replace(/\s/g, "").length < 24 ? [index] : [],
  );
  const unresolvedPages: number[] = [];
  let ocrPages = 0;
  for (const [position, index] of targets.entries()) {
    if (position >= limit) {
      unresolvedPages.push(index + 1);
      continue;
    }
    try {
      const text = (await recognize(index + 1))?.replaceAll("\0", "").trim();
      if (text) {
        // OCR supplements sparse text instead of silently replacing its content.
        pages[index] = pages[index].trim() ? `${pages[index]}\n${text}` : text;
        ocrPages++;
      } else unresolvedPages.push(index + 1);
    } catch {
      unresolvedPages.push(index + 1);
    }
  }
  return {
    pages,
    ocrPages,
    unresolvedPages,
    skippedOcrPages: Math.max(0, targets.length - limit),
  };
}
