import type { NextConfig } from "next";
// ページの CSP は proxy.ts が nonce つきで付ける。ここではそれ以外の全レスポンスに共通の防御を付ける
const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["tesseract.js", "@tesseract.js-data/jpn", "sharp"],
  outputFileTracingIncludes: {
    "/api/document": [
      "./node_modules/@tesseract.js-data/jpn/4.0.0_best_int/**/*",
      "./node_modules/tesseract.js/src/worker-script/node/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          // API は JSON だけを返す。万一 HTML として開かれても何も実行・読み込みさせない
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
