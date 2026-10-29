/**
 * ページごとに使い捨ての nonce を作り、CSP で「nonce の付いたスクリプトとスタイルだけ」を許可する。
 * 'unsafe-inline' を使わないため、仮に HTML へ文字列が混入してもスクリプトとして実行されない。
 * 手順は Next.js のガイド「How to set a Content Security Policy (CSP)」に従う（ページは動的レンダリング）。
 */
export function contentSecurityPolicy(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    // 開発時だけ React のデバッグ機能が eval を使う（本番では不要）
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
