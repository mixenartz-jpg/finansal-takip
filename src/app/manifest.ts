import type { MetadataRoute } from "next";

/**
 * PWA manifest.
 *
 * Dikte asil TELEFONDA kullanilacak: kullanici marketten cikarken
 * konusarak islem girecek. Ana ekrana eklenebilir bir uygulama,
 * tarayici sekmesinde acilan bir siteden cok daha sik kullanilir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hesap Takip",
    short_name: "Hesap",
    description: "Konuşarak işlem ekleyebildiğin kişisel finans takibi.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "tr",
    // `any` normal ikon; `maskable` Android'in adaptif kirpmasi
    // icin ayri dosya — ayni dosyayi ikisi icin kullanmak kare
    // ikonun koselerini kirptirir ve cubuklarin ucu kaybolur.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
