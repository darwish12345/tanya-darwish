import type { Metadata } from "next";
// Fon disimpan dalam pakej (tiada muat turun dari Google semasa build)
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Tanya Darwish | Portfolio Agent",
  description: "Tanya agent AI Darwish tentang projek, kemahiran dan pengalamannya.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ms"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
