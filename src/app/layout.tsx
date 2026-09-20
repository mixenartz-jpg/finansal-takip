import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { THEME_SCRIPT } from "@/lib/ui/theme";
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
  // Sekme ikonu. `manifest.ts` PWA ikonlarini ayrica tanimliyor;
  // burasi tarayici sekmesi ve yer imi icin.
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  // Tarayıcı çubuğu temayla uyumlu olsun: koyu temada beyaz bir
  // çubuk ekranın üstünde parlar.
  // Değerler `colors.ts` içindeki `bg` token'larının sRGB karşılığı.
  // Elle yazılıyor çünkü tarayıcı bu etiketi CSS'ten ÖNCE okur;
  // `themecolor.test.ts` ikisinin ayrışmasını engelliyor.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f13" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning`: script sunucudan gelen HTML'e
     * `data-theme` ekler, yani istemcideki ağaç sunucununkiyle
     * KASITLI olarak farklıdır. Bu olmasaydı React her yüklemede
     * uyumsuzluk uyarısı basardı.
     */
    <html lang="tr" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
