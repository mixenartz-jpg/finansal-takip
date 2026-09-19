import type { Transaction, TransactionKind, TransactionSource } from "@/features/transactions/types";
import type { Kurus } from "@/lib/money/types";

/**
 * CSV dışa aktarma — Excel (Türkçe) uyumlu.
 *
 * ── ÜÇ TÜRKÇE EXCEL TUZAĞI ──
 *
 * 1. AYRAÇ NOKTALI VİRGÜL. Türkçe Excel'in varsayılan alan ayracı
 *    `;`'dir. Virgül kullanılırsa tüm satır tek hücreye düşer ve
 *    kullanıcı "dosya bozuk" sanır.
 *
 * 2. BOM ZORUNLU. UTF-8 dosyanın başında BOM yoksa Excel onu ANSI
 *    sanar: "Ödeme" → "Ã–deme". Bir hesap dökümünde bu, dosyayı
 *    okunmaz yapar.
 *
 * 3. ONDALIK AYRACI VİRGÜL. `123.45` Türkçe Excel'de on iki bin
 *    üç yüz kırk beş okunur. Tutarlar `123,45` biçiminde yazılır.
 */

const SEPARATOR = ";";
const BOM = "﻿";

const KIND_LABELS: Record<TransactionKind, string> = {
  income: "Gelir",
  expense: "Gider",
  transfer: "Transfer",
};

const SOURCE_LABELS: Record<TransactionSource, string> = {
  manual: "Elle",
  voice: "Sesli",
  recurring: "Düzenli",
  import: "İçe aktarma",
};

/**
 * Elektronik tablo formül enjeksiyonunu etkisizleştiren önekler.
 *
 * Excel, `=`, `+`, `-`, `@` ile başlayan bir hücreyi FORMÜL olarak
 * çalıştırır. Kullanıcı bir işlem açıklamasına `=cmd|...` yazıp
 * dosyayı paylaşırsa, açan kişide komut çalışabilir (CSV injection).
 * Öne tek tırnak eklemek hücreyi metne zorlar.
 */
const FORMULA_STARTERS = ["=", "+", "-", "@", "\t", "\r"];

/** Bir alanı CSV'ye güvenli biçimde yazar. */
export function csvField(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";

  let out = value;

  // Formül enjeksiyonu: kaçıştan ÖNCE uygulanır ki tırnaklama
  // önekin kendisini de sarsın.
  if (FORMULA_STARTERS.some((c) => out.startsWith(c))) {
    out = `'${out}`;
  }

  // Ayraç, tırnak veya satır sonu içeriyorsa tırnakla; içteki
  // tırnakları ikiye katla (RFC 4180).
  //
  // ÇIPLAK `\r` DE SAYILIR: eski Mac biçiminden yapıştırılan bir
  // açıklama `\n` olmadan tek başına `\r` taşıyabilir. Yalnızca
  // `\n` kontrol edilseydi o alan tırnaksız yazılır ve bazı
  // ayrıştırıcılar (Excel dahil) satırı orada bölerdi.
  if (
    out.includes(SEPARATOR) ||
    out.includes('"') ||
    out.includes("\n") ||
    out.includes("\r")
  ) {
    out = `"${out.replace(/"/g, '""')}"`;
  }

  return out;
}

/**
 * Kuruşu TR ondalık biçiminde yazar: 12345 → "123,45"
 *
 * `Intl` KULLANILMAZ: binlik ayracı eklerdi ("1.234,56") ve Excel
 * onu ayrı bir alan sanmasa bile sayı olarak ayrıştıramazdı.
 * Elektronik tablo için ham sayı gerekir, biçimli metin değil.
 */
function csvAmount(kurus: Kurus, kind: TransactionKind): string {
  // Gider negatif yazılır: Excel'de toplam alındığında doğru
  // sonuç çıksın. İşaretsiz yazılsaydı kullanıcı gelir ve gideri
  // elle ayırmak zorunda kalırdı.
  const signed = kind === "expense" ? -kurus : kurus;
  const abs = Math.abs(signed);
  const lira = Math.floor(abs / 100);
  const kr = abs % 100;
  const sign = signed < 0 ? "-" : "";
  return `${sign}${lira},${String(kr).padStart(2, "0")}`;
}

const HEADERS = [
  "Tarih",
  "Tür",
  "Tutar",
  "Hesap",
  "Hedef Hesap",
  "Kategori",
  "Açıklama",
  "Kaynak",
  "Ses Kaydı",
] as const;

/**
 * İşlem listesini CSV metnine çevirir.
 *
 * Dönen metin doğrudan bir Blob'a yazılıp indirilebilir; BOM zaten
 * başına eklenmiştir.
 */
export function buildTransactionCsv(
  transactions: readonly Transaction[],
  accountNames: ReadonlyMap<string, string>,
  categoryNames: ReadonlyMap<string, string>,
): string {
  const lines: string[] = [HEADERS.join(SEPARATOR)];

  for (const t of transactions) {
    lines.push(
      [
        csvField(t.date),
        csvField(KIND_LABELS[t.kind]),
        csvAmount(t.amountKurus, t.kind),
        csvField(accountNames.get(t.accountId) ?? ""),
        csvField(
          t.counterAccountId ? (accountNames.get(t.counterAccountId) ?? "") : "",
        ),
        csvField(t.categoryId ? (categoryNames.get(t.categoryId) ?? "") : ""),
        csvField(t.note),
        csvField(SOURCE_LABELS[t.source]),
        csvField(t.voiceTranscript),
      ].join(SEPARATOR),
    );
  }

  return BOM + lines.join("\n");
}

/** İndirilecek dosya adı: `hesap-takip-2026-09.csv` */
export function csvFileName(from: string, to: string): string {
  return from.slice(0, 7) === to.slice(0, 7)
    ? `hesap-takip-${from.slice(0, 7)}.csv`
    : `hesap-takip-${from}_${to}.csv`;
}
