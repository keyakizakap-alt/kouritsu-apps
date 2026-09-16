type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

/** Enforce the upload limit on streamed bytes, even without Content-Length. */
export async function boundedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw Error("size");
  if (!request.body) throw Error("file");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
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
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function clientAddress(request: Request) {
  const value =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  return value.split(",")[0].trim().slice(0, 80);
}

export function assertSameSite(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw Error("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw Error("cross-site");
}

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
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now || buckets.size > MAX_BUCKETS)
        buckets.delete(candidate);
    }
  }

  if (bucket.count <= limit) return null;
  return Response.json(
    { error: "短時間に処理が集中しています。少し待って再試行してください。" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(
          Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        ),
      },
    },
  );
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
