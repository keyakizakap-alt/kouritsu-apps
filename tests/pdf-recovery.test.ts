import test from "node:test";
import assert from "node:assert/strict";
import { recoverPdfPages } from "../lib/pdf-recovery.ts";

test("mixed PDF retains native text and recovers later pages after OCR failure", async () => {
  const native = "Readable native PDF requirement text is preserved exactly.";
  const result = await recoverPdfPages(
    [native, "", "", "参考"],
    async (page) => {
      if (page === 2) throw Error("unreadable image");
      return page === 3 ? "Scanned requirement" : "補足の要件";
    },
  );
  assert.deepEqual(result.pages, [
    native,
    "",
    "Scanned requirement",
    "参考\n補足の要件",
  ]);
  assert.deepEqual(result.unresolvedPages, [2]);
  assert.equal(result.ocrPages, 2);
});
test("missing images, blank OCR and page cap are disclosed without losing page numbering", async () => {
  const calls: number[] = [];
  const result = await recoverPdfPages(
    ["", "", "", ""],
    async (page) => {
      calls.push(page);
      return page === 1 ? null : "  ";
    },
    2,
  );
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(result.unresolvedPages, [1, 2, 3, 4]);
  assert.equal(result.skippedOcrPages, 2);
  assert.equal(result.pages.length, 4);
});
