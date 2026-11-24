import { isIPv4, isIPv6 } from "node:net";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;
const inFlight = new Map<string, number>();

/**
 * レート制限に使う接続元。X-Forwarded-For などはクライアントが自由に書けるため、
 * 前段のプロキシが必ず上書きすると分かっている場合だけ使う。
 * - Vercel: X-Forwarded-For を Vercel が上書きする（Vercel のドキュメント「Request headers」）
 * - 自前のリバースプロキシ: TRUSTED_PROXY_IP_HEADER にそのヘッダー名を設定する
 * どちらでもなければ、すべての接続で 1 つの枠を共有する（ヘッダーの偽装で制限を回避されないため）。
 */
export function clientAddress(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const header =
    env.VERCEL === "1"
      ? "x-forwarded-for"
      : env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  if (!header) return "shared";
  const value = request.headers.get(header)?.split(",")[0].trim();
  return value && (isIPv4(value) || isIPv6(value)) ? value : "unknown";
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * 接続先として想定しているホスト名か。DNS リバインディング（攻撃者のドメインを 127.0.0.1 に
 * 向け直してローカルのサーバーを呼ぶ攻撃）を防ぐため、ローカル名と ALLOWED_HOSTS だけを許可する。
 * Vercel では自分のドメイン以外へは振り分けられないため確認しない。
 */
export function isAllowedHost(
  host: string,
  env: Record<string, string | undefined> = process.env,
) {
  if (env.VERCEL === "1") return true;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  const extra = (env.ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return LOCAL_HOSTS.includes(name) || extra.includes(name);
}

/**
 * ブラウザからの別サイト経由の送信（CSRF）を拒否する。
 * Origin は、ブラウザが実際に接続した Host と比べる（request.url はサーバー内部の名前になることがある）。
 * Sec-Fetch-Site は same-origin（または直接操作の none）だけを許可し、同じサイトの別オリジンも拒否する。
 */
export function assertSameSite(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isAllowedHost(host)) throw Error("host");
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw Error("origin");
    }
    if (originHost !== host) throw Error("origin");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    throw Error("cross-site");
}

const tooMany = (retryAfter: number) =>
  Response.json(
    { error: "短時間に処理が集中しています。少し待って再試行してください。" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );

export function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
) {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > MAX_BUCKETS) {
    // 期限切れを先に消し、それでも多ければ古い順に消す
    for (const [candidate, value] of buckets)
      if (value.resetAt <= now) buckets.delete(candidate);
    for (const candidate of buckets.keys()) {
      if (buckets.size <= MAX_BUCKETS) break;
      if (candidate !== key) buckets.delete(candidate);
    }
  }

  if (bucket.count <= limit) return null;
  return tooMany(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
}

/**
 * 同時に実行できる重い処理（OCR など）の数を、接続元に関係なく全体で制限する。
 * 戻り値の release を finally で必ず呼ぶ。上限に達していれば 429 を返す。
 */
export function acquireSlot(scope: string, max: number) {
  const current = inFlight.get(scope) ?? 0;
  if (current >= max) return { response: tooMany(5), release: () => {} };
  inFlight.set(scope, current + 1);
  let released = false;
  return {
    response: null,
    release() {
      if (released) return;
      released = true;
      inFlight.set(scope, (inFlight.get(scope) ?? 1) - 1);
    },
  };
}

/**
 * リクエスト本文を上限つきで読む。Content-Length がない（chunked）送信でも、
 * 上限を超えた時点で読むのをやめるため、メモリを使い切られない。
 */
export async function readLimitedBody(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw Error("size");
  const reader = request.body?.getReader();
  if (!reader) throw Error("body");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Error("size");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}

export function hasExpectedSignature(extension: string, bytes: Uint8Array) {
  if (extension === "pdf")
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (extension === "docx" || extension === "xlsx")
    return (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
        (bytes[2] === 0x05 && bytes[3] === 0x06) ||
        (bytes[2] === 0x07 && bytes[3] === 0x08))
    );
  return true;
}

export const ZIP_LIMITS = {
  maxEntries: 2000,
  maxTotalBytes: 100 * 1024 * 1024,
  maxRatio: 200,
};

/**
 * DOCX / XLSX（zip）を展開する前に、中央ディレクトリの記録で展開後のサイズを確かめる（zip 爆弾対策）。
 * 目録を読めない・ZIP64 を使う・上限を超える場合は例外を投げる。
 */
export function assertSafeZip(bytes: Uint8Array, limits = ZIP_LIMITS) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchFrom = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= searchFrom; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw Error("zip");
  const entries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdOffset === 0xffffffff) throw Error("zip64");
  if (entries > limits.maxEntries) throw Error("zip-entries");
  if (cdOffset + cdSize > eocd) throw Error("zip");
  let offset = cdOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50)
      throw Error("zip");
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    if (compressed === 0xffffffff || size === 0xffffffff) throw Error("zip64");
    total += size;
    if (total > limits.maxTotalBytes) throw Error("zip-size");
    if (size > 1024 * 1024 && size > limits.maxRatio * Math.max(compressed, 1))
      throw Error("zip-ratio");
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

/** 接続先として使ってはいけない（内部ネットワーク・ループバック等の）ホストか。 */
export function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  )
    return true;
  if (isIPv4(host)) {
    const [a, b] = host.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // リンクローカル・クラウドのメタデータ
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // マルチキャスト・予約
    );
  }
  if (isIPv6(host)) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("::ffff:") || // IPv4 射影アドレス（127.0.0.1 などを隠せる）
      /^f[cd][0-9a-f]{0,2}:/.test(host) || // fc00::/7 ユニークローカル
      /^fe[89ab][0-9a-f]?:/.test(host) // fe80::/10 リンクローカル
    );
  }
  return false;
}
