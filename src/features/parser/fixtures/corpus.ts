import type { ParseCategory, ParseAccount } from "../types";

/**
 * Altın korpus — parser'ın doğruluk ölçütü.
 *
 * Her satır konuşma dilinde gerçekten söylenebilecek bir cümle ve
 * beklenen çıktısı. Parser değiştirildiğinde bu dosya regresyonu
 * yakalar: tek bir sözlük eklemesi başka on cümleyi bozabilir ve
 * bunu elle fark etmek imkânsız.
 *
 * `expected` alanlarından YALNIZCA yazılanlar doğrulanır; yazılmayan
 * alan "umursanmıyor" demektir. Böylece bir cümlede sadece tutarı,
 * başkasında sadece türü sınayabiliyoruz.
 */

export interface CorpusCase {
  text: string;
  expected: {
    kind?: "income" | "expense" | "transfer" | null;
    /** Kuruş cinsinden. */
    amountKurus?: number | null;
    /** Kategori ID'si (CORPUS_CATEGORIES içindeki). */
    categoryId?: string | null;
    /** Sabit bugüne (CORPUS_TODAY) göre beklenen tarih. */
    date?: string;
    accountId?: string;
    /** Bu cümlede güvenin eşiğin altında kalması bekleniyor mu. */
    lowConfidence?: boolean;
  };
}

/** Sabit "bugün": 2026-09-19, cumartesi. */
export const CORPUS_TODAY = "2026-09-19";

export const CORPUS_CATEGORIES: ParseCategory[] = [
  { id: "inc-maas", name: "Maaş", kind: "income", keywords: [] },
  { id: "inc-ek", name: "Ek Gelir", kind: "income", keywords: [] },
  { id: "inc-faiz", name: "Faiz", kind: "income", keywords: [] },
  { id: "exp-yemek", name: "Yemek", kind: "expense", keywords: [] },
  { id: "exp-market", name: "Market", kind: "expense", keywords: [] },
  { id: "exp-ulasim", name: "Ulaşım", kind: "expense", keywords: [] },
  { id: "exp-fatura", name: "Fatura", kind: "expense", keywords: [] },
  { id: "exp-kira", name: "Kira", kind: "expense", keywords: [] },
  { id: "exp-saglik", name: "Sağlık", kind: "expense", keywords: [] },
  { id: "exp-giyim", name: "Giyim", kind: "expense", keywords: [] },
  { id: "exp-eglence", name: "Eğlence", kind: "expense", keywords: [] },
  { id: "exp-egitim", name: "Eğitim", kind: "expense", keywords: [] },
];

export const CORPUS_ACCOUNTS: ParseAccount[] = [
  { id: "acc-nakit", name: "Nakit", kind: "cash" },
  { id: "acc-banka", name: "Banka", kind: "bank" },
  { id: "acc-kart", name: "Kredi Kartı", kind: "credit_card" },
];

export const CORPUS: readonly CorpusCase[] = [
  // ══════════ GELİR — açık sinyaller ══════════
  {
    text: "bugün 40.000 tl para geldi",
    expected: { kind: "income", amountKurus: 4_000_000, date: "2026-09-19" },
  },
  {
    text: "kırk bin lira maaş yattı",
    expected: { kind: "income", amountKurus: 4_000_000, categoryId: "inc-maas" },
  },
  {
    text: "maaşım yattı 45.000 tl",
    expected: { kind: "income", amountKurus: 4_500_000, categoryId: "inc-maas" },
  },
  {
    text: "bugün 15 bin tl hesabıma girdi",
    expected: { kind: "income", amountKurus: 1_500_000 },
  },
  { text: "5000 tl kazandım", expected: { kind: "income", amountKurus: 500_000 } },
  {
    text: "2.500 tl prim geldi",
    expected: { kind: "income", amountKurus: 250_000, categoryId: "inc-ek" },
  },
  {
    text: "1200 tl faiz geliri geldi",
    expected: { kind: "income", amountKurus: 120_000, categoryId: "inc-faiz" },
  },
  {
    text: "dün 3000 tl tahsil ettim",
    expected: { kind: "income", amountKurus: 300_000, date: "2026-09-18" },
  },
  {
    text: "iki bin beş yüz lira ek gelir geldi",
    expected: { kind: "income", amountKurus: 250_000 },
  },
  { text: "750 tl iade geldi", expected: { kind: "income", amountKurus: 75_000 } },
  {
    text: "ikramiye yattı 8000 tl",
    expected: { kind: "income", amountKurus: 800_000 },
  },
  {
    text: "bir milyon lira geldi",
    expected: { kind: "income", amountKurus: 100_000_000 },
  },

  // ══════════ GELİR — "aldım" belirsizliği, nesne çözüyor ══════════
  { text: "maaşımı aldım", expected: { kind: "income" } },
  {
    text: "40 bin tl para aldım",
    expected: { kind: "income", amountKurus: 4_000_000 },
  },
  { text: "ödememi aldım", expected: { kind: "income" } },
  { text: "alacağımı aldım", expected: { kind: "income" } },
  { text: "avansımı aldım 5000 tl", expected: { kind: "income", amountKurus: 500_000 } },
  { text: "primimi aldım", expected: { kind: "income" } },
  { text: "ücretimi aldım", expected: { kind: "income" } },

  // ══════════ GİDER — açık sinyaller ══════════
  {
    text: "200 tl yemek aldım",
    expected: { kind: "expense", amountKurus: 20_000, categoryId: "exp-yemek" },
  },
  {
    text: "dün markete 350 lira verdim",
    expected: {
      kind: "expense",
      amountKurus: 35_000,
      categoryId: "exp-market",
      date: "2026-09-18",
    },
  },
  {
    text: "kartla 1.250,50 tl fatura ödedim",
    expected: {
      kind: "expense",
      amountKurus: 125_050,
      categoryId: "exp-fatura",
      accountId: "acc-kart",
    },
  },
  {
    text: "yüz elli tl taksi",
    expected: { kind: "expense", amountKurus: 15_000, categoryId: "exp-ulasim" },
  },
  {
    text: "5000 tl kira ödedim",
    expected: { kind: "expense", amountKurus: 500_000, categoryId: "exp-kira" },
  },
  {
    text: "eczaneye 180 tl harcadım",
    expected: { kind: "expense", amountKurus: 18_000, categoryId: "exp-saglik" },
  },
  {
    text: "450 lira ayakkabı aldım",
    expected: { kind: "expense", amountKurus: 45_000, categoryId: "exp-giyim" },
  },
  {
    text: "sinemaya 120 tl verdim",
    expected: { kind: "expense", amountKurus: 12_000, categoryId: "exp-eglence" },
  },
  {
    text: "kitap için 300 tl ödedim",
    expected: { kind: "expense", amountKurus: 30_000, categoryId: "exp-egitim" },
  },
  {
    text: "benzine 1500 tl harcadım",
    expected: { kind: "expense", amountKurus: 150_000, categoryId: "exp-ulasim" },
  },
  {
    text: "elektrik faturası 890 tl ödedim",
    expected: { kind: "expense", amountKurus: 89_000, categoryId: "exp-fatura" },
  },
  {
    text: "migros tan 420 tl alışveriş yaptım",
    expected: { kind: "expense", amountKurus: 42_000, categoryId: "exp-market" },
  },
  {
    text: "doktora 600 tl ödedim",
    expected: { kind: "expense", amountKurus: 60_000, categoryId: "exp-saglik" },
  },
  {
    text: "netflix aboneliği 250 tl",
    expected: { kind: "expense", amountKurus: 25_000, categoryId: "exp-eglence" },
  },
  {
    text: "iki yüz elli lira kahvaltı",
    expected: { kind: "expense", amountKurus: 25_000, categoryId: "exp-yemek" },
  },
  {
    text: "internet faturasına 400 tl gitti",
    expected: { kind: "expense", amountKurus: 40_000, categoryId: "exp-fatura" },
  },
  {
    text: "bin lira harcadım",
    expected: { kind: "expense", amountKurus: 100_000 },
  },
  {
    text: "aidat 750 tl ödedim",
    expected: { kind: "expense", amountKurus: 75_000, categoryId: "exp-fatura" },
  },
  {
    text: "otobüse 45 tl verdim",
    expected: { kind: "expense", amountKurus: 4_500, categoryId: "exp-ulasim" },
  },

  // ══════════ TARİH varyasyonları ══════════
  {
    text: "dün 200 tl yemek aldım",
    expected: { kind: "expense", amountKurus: 20_000, date: "2026-09-18" },
  },
  {
    text: "bugün 500 tl market",
    expected: { amountKurus: 50_000, date: "2026-09-19" },
  },
  {
    text: "evvelsi gün 300 tl ödedim",
    expected: { kind: "expense", amountKurus: 30_000, date: "2026-09-17" },
  },
  {
    text: "geçen hafta 1000 tl harcadım",
    expected: { kind: "expense", amountKurus: 100_000, date: "2026-09-12" },
  },
  {
    text: "geçen ay kira 5000 tl ödedim",
    expected: { kind: "expense", amountKurus: 500_000, date: "2026-08-19" },
  },
  {
    text: "15 mart kira ödedim 4500 tl",
    expected: { kind: "expense", amountKurus: 450_000, date: "2026-03-15" },
  },
  {
    text: "pazartesi 250 tl yemek aldım",
    expected: { kind: "expense", amountKurus: 25_000, date: "2026-09-14" },
  },
  {
    text: "5 eylül 800 tl ödedim",
    expected: { kind: "expense", amountKurus: 80_000, date: "2026-09-05" },
  },
  // Tarih yoksa bugün varsayılır.
  {
    text: "300 tl market alışverişi",
    expected: { amountKurus: 30_000, date: "2026-09-19" },
  },

  // ══════════ SAYI biçimleri ══════════
  { text: "40.000 tl geldi", expected: { amountKurus: 4_000_000 } },
  { text: "40000 tl geldi", expected: { amountKurus: 4_000_000 } },
  { text: "kırk bin tl geldi", expected: { amountKurus: 4_000_000 } },
  { text: "1.234,56 tl ödedim", expected: { amountKurus: 123_456 } },
  { text: "1234,56 tl ödedim", expected: { amountKurus: 123_456 } },
  { text: "1234.56 tl ödedim", expected: { amountKurus: 123_456 } },
  { text: "yüz tl", expected: { amountKurus: 10_000 } },
  { text: "bin tl", expected: { amountKurus: 100_000 } },
  { text: "yüz elli tl", expected: { amountKurus: 15_000 } },
  { text: "iki yüz elli tl", expected: { amountKurus: 25_000 } },
  { text: "bin iki yüz elli tl", expected: { amountKurus: 125_000 } },
  { text: "iki bin yirmi beş tl", expected: { amountKurus: 202_500 } },
  { text: "bir milyon tl", expected: { amountKurus: 100_000_000 } },
  { text: "iki milyon beş yüz bin tl", expected: { amountKurus: 250_000_000 } },
  { text: "yüz yirmi beş bin tl", expected: { amountKurus: 12_500_000 } },
  { text: "iki buçuk milyon tl", expected: { amountKurus: 250_000_000 } },
  { text: "beş yüz lira", expected: { amountKurus: 50_000 } },
  { text: "200₺ market", expected: { amountKurus: 20_000 } },
  { text: "1.234.567 tl", expected: { amountKurus: 123_456_700 } },

  // ══════════ HESAP ipuçları ══════════
  {
    text: "kartla 500 tl ödedim",
    expected: { accountId: "acc-kart", amountKurus: 50_000 },
  },
  {
    text: "nakit 200 tl verdim",
    expected: { accountId: "acc-nakit", amountKurus: 20_000 },
  },
  {
    text: "bankadan 1000 tl ödedim",
    expected: { accountId: "acc-banka", amountKurus: 100_000 },
  },
  {
    text: "kredi kartıyla 750 tl harcadım",
    expected: { accountId: "acc-kart", amountKurus: 75_000 },
  },
  {
    text: "elden 300 tl verdim",
    expected: { accountId: "acc-nakit", amountKurus: 30_000 },
  },

  // ══════════ TRANSFER ══════════
  { text: "1000 tl havale yaptım", expected: { kind: "transfer", amountKurus: 100_000 } },
  { text: "5000 tl aktardım", expected: { kind: "transfer", amountKurus: 500_000 } },
  { text: "500 tl atm den çektim", expected: { kind: "transfer", amountKurus: 50_000 } },
  { text: "2000 tl eft yaptım", expected: { kind: "transfer", amountKurus: 200_000 } },

  // ══════════ BELİRSİZ — parser sormalı, uydurmamalı ══════════
  { text: "aldım", expected: { kind: null, lowConfidence: true } },
  { text: "bugün hava çok güzel", expected: { kind: null, lowConfidence: true } },
  { text: "bir şeyler aldım", expected: { kind: null, lowConfidence: true } },

  // ══════════ TUTAR olmayan sayılar tutar sanılmamalı ══════════
  { text: "saat 14 te 200 tl ödedim", expected: { amountKurus: 20_000 } },
  { text: "5 dakika önce 200 tl ödedim", expected: { amountKurus: 20_000 } },
  { text: "3 kişi 600 tl yemek yedik", expected: { amountKurus: 60_000 } },
  { text: "2 tane aldım 150 tl", expected: { amountKurus: 15_000 } },

  // ══════════ BÜYÜK HARF / aksansız yazım ══════════
  {
    text: "200 TL YEMEK ALDIM",
    expected: { kind: "expense", amountKurus: 20_000, categoryId: "exp-yemek" },
  },
  {
    text: "kirk bin lira maas yatti",
    expected: { kind: "income", amountKurus: 4_000_000, categoryId: "inc-maas" },
  },
  {
    text: "DUN MARKETE 350 LIRA VERDIM",
    expected: { kind: "expense", amountKurus: 35_000, date: "2026-09-18" },
  },

  // ══════════ UZUN / doğal cümleler ══════════
  {
    text: "dün akşam arkadaşlarla dışarıda yemek yedik 850 tl ödedim",
    expected: { kind: "expense", amountKurus: 85_000, date: "2026-09-18" },
  },
  {
    text: "bu ay maaşım 52.500 tl olarak yattı",
    expected: { kind: "income", amountKurus: 5_250_000, categoryId: "inc-maas" },
  },
  {
    text: "markete gidip 1.250 tl lik alışveriş yaptım",
    expected: { amountKurus: 125_000, categoryId: "exp-market" },
  },
];
