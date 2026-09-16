import test from "node:test";
import assert from "node:assert/strict";
import { boundedBody } from "../lib/security.ts";

test("upload limit rejects oversized streams without Content-Length", async () => {
  await assert.rejects(
    () =>
      boundedBody(
        new Request("https://app.test", { method: "POST", body: "123456" }),
        5,
      ),
    /size/,
  );
  const bytes = await boundedBody(
    new Request("https://app.test", { method: "POST", body: "12345" }),
    5,
  );
  assert.equal(new TextDecoder().decode(bytes), "12345");
});
test("multipart data survives bounded reading unchanged", async () => {
  const form = new FormData();
  form.append("file", new File(["確認用テキスト"], "sample.txt"));
  const request = new Request("https://app.test", {
    method: "POST",
    body: form,
  });
  const bytes = await boundedBody(request, 4096);
  const parsed = await new Response(bytes, {
    headers: { "Content-Type": request.headers.get("content-type")! },
  }).formData();
  assert.equal(await (parsed.get("file") as File).text(), "確認用テキスト");
});
