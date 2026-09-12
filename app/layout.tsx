import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "要件整合レビュー｜公共提案ワークスペース",
  description:
    "架空の公共仕様書を用いた、判定基準に基づく要件確認ワークスペース。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
