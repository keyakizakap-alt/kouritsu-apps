// バックエンドの防御（lib/security.ts・lib/csp.ts）のテスト。
// 各テストは「攻撃が通らないこと」と「正規の利用が止まらないこと」の両方を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  assertSafeZip,
  assertSameSite,
  clientAddress,
  isAllowedHost,
  isPrivateHost,
  readLimitedBody,
} from "../lib/security.ts";
import { contentSecurityPolicy } from "../lib/csp.ts";

const req = (headers: Record<string, string>, url = "http://localhost:3000/") =>
  new Request(url, { method: "POST", headers });

test("X-Forwarded-For は信頼できるプロキシの下でだけ使う（偽装でレート制限を回避させない）", () => {
  const spoofed = req({ "x-forwarded-for": "203.0.113.7" });
  assert.equal(
    clientAddress(spoofed, {}),
    "shared",
    "プロキシを信頼する設定がないのに X-Forwarded-For を使っている。直し方: lib/security.ts の clientAddress",
  );
  assert.equal(clientAddress(spoofed, { VERCEL: "1" }), "203.0.113.7");
  assert.equal(
    clientAddress(req({ "x-real-ip": "198.51.100.1" }), {
      TRUSTED_PROXY_IP_HEADER: "X-Real-IP",
    }),
    "198.51.100.1",
  );
  assert.equal(
    clientAddress(req({ "x-forwarded-for": "not-an-ip" }), { VERCEL: "1" }),
    "unknown",
    "IP アドレスでない値をそのままキーにしている（キーの水増しでメモリを使われる）",
  );
});

test("Host の許可リストで DNS リバインディングを防ぐ", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])
    assert.ok(isAllowedHost(host, {}), `${host} を拒否している`);
  assert.ok(
    !isAllowedHost("evil.example:3000", {}),
    "任意のホスト名を受け付けている。直し方: isAllowedHost",
  );
  assert.ok(
    isAllowedHost("review.example.jp", { ALLOWED_HOSTS: "review.example.jp" }),
  );
  assert.ok(isAllowedHost("anything.vercel.app", { VERCEL: "1" }));
});

test("別オリジン・同一サイトの別オリジン・リバインディングからの送信を拒否する", () => {
  const ok: Record<string, string>[] = [
    { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    { host: "localhost:3000", origin: "http://localhost:3000" },
    { host: "localhost:3000", "sec-fetch-site": "same-origin" },
    { host: "localhost:3000" },
  ];
  for (const headers of ok)
    assert.doesNotThrow(
      () => assertSameSite(req(headers)),
      `正規の送信 ${JSON.stringify(headers)} を拒否している`,
    );
  const bad: Record<string, string>[] = [
    { host: "localhost:3000", origin: "https://evil.example" },
    { host: "localhost:3000", origin: "null" },
    { host: "localhost:3000", "sec-fetch-site": "cross-site" },
    { host: "localhost:3000", "sec-fetch-site": "same-site" },
    { host: "evil.example:3000", origin: "http://evil.example:3000" },
  ];
  for (const headers of bad)
    assert.throws(
      () => assertSameSite(req(headers)),
      `攻撃的な送信 ${JSON.stringify(headers)} を受け付けている。直し方: assertSameSite`,
    );
});

test("内部ネットワークのホストを LLM の接続先として拒否する（SSRF）", () => {
  const blocked = [
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "[::1]",
    "::1",
    "[::ffff:7f00:1]",
    "[fd00::1]",
    "[fe80::1]",
    "metadata.google.internal",
    "printer.local",
  ];
  for (const host of blocked)
    assert.ok(
      isPrivateHost(host),
      `${host} を外部ホストとして扱っている。直し方: isPrivateHost`,
    );
  for (const host of ["api.example.com", "8.8.8.8", "[2001:4860:4860::8888]"])
    assert.ok(!isPrivateHost(host), `${host} を内部ホストとして扱っている`);
});

/** テスト用の最小の zip を作る（実際のサイズを記録した中央ディレクトリつき）。 */
function makeZip(entries: { name: string; data: Uint8Array }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

test("DOCX / XLSX の zip 爆弾を展開前に拒否する", () => {
  const normal = makeZip([
    { name: "word/document.xml", data: Buffer.from("<w:document/>") },
  ]);
  assert.doesNotThrow(() => assertSafeZip(normal), "普通の zip を拒否している");
  const bomb = makeZip([
    { name: "word/document.xml", data: new Uint8Array(20 * 1024 * 1024) },
  ]);
  assert.throws(
    () => assertSafeZip(bomb),
    /zip-ratio/,
    "圧縮率の極端な要素を通している。直し方: assertSafeZip",
  );
  assert.throws(
    () =>
      assertSafeZip(normal, {
        maxEntries: 2000,
        maxTotalBytes: 5,
        maxRatio: 200,
      }),
    /zip-size/,
    "展開後の合計サイズの上限が効いていない",
  );
  assert.throws(() => assertSafeZip(normal.slice(0, normal.length - 5)), /zip/);
  const zip64 = normal.slice();
  new DataView(zip64.buffer).setUint32(zip64.length - 6, 0xffffffff, true);
  assert.throws(() => assertSafeZip(zip64), /zip64/);
});

test("Content-Length のない本文も上限で打ち切る", async () => {
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1024;
      controller.enqueue(new Uint8Array(1024));
      if (pulled >= 1024 * 1024) controller.close();
    },
  });
  const request = new Request("http://localhost/", {
    method: "POST",
    body: stream,
    // @ts-expect-error Node の fetch 実装はストリーム本文に duplex を要求する
    duplex: "half",
  });
  await assert.rejects(readLimitedBody(request, 10 * 1024), /size/);
  assert.ok(
    pulled < 64 * 1024,
    `上限を超えても ${pulled} バイト読み続けた。直し方: readLimitedBody`,
  );
  const small = new Request("http://localhost/", {
    method: "POST",
    body: "hello",
  });
  assert.equal((await readLimitedBody(small, 10)).byteLength, 5);
  const declared = new Request("http://localhost/", {
    method: "POST",
    body: "x",
    headers: { "content-length": "999999" },
  });
  await assert.rejects(readLimitedBody(declared, 10), /size/);
});

test("ページの CSP は nonce 方式で、本番では 'unsafe-inline' も 'unsafe-eval' も許さない", () => {
  const csp = contentSecurityPolicy("abc123", false);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
  assert.match(csp, /style-src 'self' 'nonce-abc123'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(
    csp,
    /'unsafe-inline'|'unsafe-eval'/,
    "本番の CSP に unsafe が含まれている。直し方: proxy.ts の contentSecurityPolicy",
  );
  assert.match(contentSecurityPolicy("x", true), /'unsafe-eval'/);
});
