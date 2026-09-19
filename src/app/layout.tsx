import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Inter, latin-ext alt kumesiyle.
 *
 * `latin-ext` SART: Turkce'nin g, s, c, o, u, i harfleri latin
 * alt kumesinde YOKTUR. Yalnizca "latin" yuklenirse bu harfler yedek
 * fontla cizilir ve metin ortasinda font degisimi goze carpar.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hesap Takip",
  description: "Konuşarak işlem ekleyebildiğin kişisel finans takibi.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
