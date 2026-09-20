# Sohbet Asistanı, Tam Düzenlenebilirlik ve Koyu Tema — Tasarım

**Tarih:** 2026-09-20
**Durum:** Onaylandı, uygulamaya hazır

---

## Amaç

Üç istek, tek tasarım:

1. Mevcut dikte özelliği bir **sohbet asistanına** dönüşsün — yazarak da konuşarak da kullanılsın.
2. Asistan sitedeki **her veriye erişebilsin ve düzenleyebilsin**.
3. Site **koyu temayı** desteklesin.

Bunlara bir dördüncüsü zorunlu olarak eklenir: "her şey hem elle hem asistanla düzenlenebilsin" isteğinin **elle** yarısı bugün eksik. Asistan bu eksik mutation'ların üstüne bineceği için önce o boşluk kapatılır.

---

## Mevcut durum

### Çalışan altyapı

- **Dikte akışı:** `mikrofon → kural parser → DraftCard onayı → tek işlem kaydet`
- **Parser zinciri:** `ChainedParser` bir LLM yedeği için zaten hazır bırakılmış (`createParser({ fallback })`). `GEMINI_API_KEY` `.env.example`'da sunucu değişkeni olarak ayrılmış.
- **Tasarım token'ları:** Ham değerler `:root`'ta, `@theme` yalnızca Tailwind takma adı tutuyor. Bileşenler sabit renk kullanmıyor, hepsi token okuyor.
- **RLS:** Her tabloda `(select auth.uid()) = user_id`, `to authenticated`, INSERT/UPDATE'te `with check`.

### Yazma yeteneği boşluğu (kod incelemesiyle doğrulandı)

| Alan | Ekle | Güncelle | Sil / Arşivle |
|---|---|---|---|
| İşlemler | ✅ | ❌ **eksik** | ✅ |
| Hesaplar | ✅ | ❌ **eksik** | ✅ (arşivle) |
| Kategoriler | ✅ | ⚠️ yalnızca keyword | ❌ **eksik** |
| Bütçeler | ✅ | ✅ (upsert) | ✅ |
| Düzenli ödemeler | ✅ | ✅ | ✅ |
| Borçlar | ✅ | ✅ | ✅ |

Bütçe, düzenli ödeme ve borç tarafı tamdır; dokunulmaz.

---

## Alınan kararlar

| Konu | Karar |
|---|---|
| Asistanın yazma yetkisi | **Onay kartıyla.** Okuma serbest, her yazma onaylanır. |
| AI motoru | **Gemini API, sunucu tarafı.** Anahtar tarayıcıya hiç gitmez. Model zinciri aşağıda. |
| Erişim kapsamı | İşlemler + hesaplar/bakiyeler + kategoriler/bütçeler + düzenli/borçlar (tümü). |
| Koyu tema | **Sistem tercihi + manuel geçiş** (Açık / Koyu / Sistem). |
| Sıralama | **Önce elle düzenleme, sonra asistan.** |
| Dikte ile ilişki | **Tek panel:** yaz veya konuş. |

---

## Mimari

### Temel ilke: tek yazma kapısı

Asistan Supabase'e **doğrudan yazmaz.** Formların kullandığı mutation hook'larının aynısını kullanır.

```
                    ┌──────────────────────────────┐
   Elle (form) ────▶│  features/*/queries.ts       │
                    │  (mutation hook'ları)        │──▶ Supabase (RLS)
   Asistan   ────▶  │  = TEK YAZMA KAPISI          │
                    └──────────────────────────────┘
```

**Gerekçe:** Doğrulama (`validateTransaction`), hata çevirisi (`toUserError`) ve önbellek geçersiz kılma (`invalidateQueries`) bugün bu katmanda yaşıyor. Asistan ikinci bir yol açsaydı üçü de yeniden yazılır ve zamanla ayrışırdı — "formdan eklenince bütçe çubuğu güncelleniyor, asistandan eklenince güncellenmiyor" tipi hatalar bu ayrışmanın doğrudan sonucudur.

### AI'nin rolü: niyet çevirisi, eylem değil

Gemini hiçbir şey yapmaz; yalnızca doğal dili **yapılandırılmış niyete** çevirir.

```
"geçen hafta markete 300 attım, onu 250 yap"
        │
        ▼  POST /api/chat        (sunucu — GEMINI_API_KEY burada kalır)
   Gemini + araç tanımları (tool calling)
        │
        ▼  { tool: "updateTransaction", args: { id, amountKurus: 25000 } }
   İstemci: niyeti ActionCard'a çevirir
        │
        ▼  kullanıcı onaylar
   useUpdateTransaction()          ← mevcut mutation, tek kapı
```

**Güvenlik sonuçları:**

- Gemini'nin veritabanına erişimi yoktur. Sunucuya giden: sohbet metni + kullanıcının kategori/hesap **adları**. Dönen: bir niyet nesnesi.
- `service_role` anahtarı hiç devreye girmez; RLS dokunulmadan kalır.
- Niyet nesnesi istemcide şema doğrulamasından geçer. Gemini tanımsız bir araç adı veya bozuk argüman üretirse istek reddedilir, kullanıcıya hata gösterilir.
- Yazma yolu her zaman kullanıcı oturumuyla, kullanıcının kendi RLS kapsamında çalışır. Asistan başka bir kullanıcının verisine teknik olarak erişemez.

### Model zinciri

Tek model değil, kota tükenince sıradakine düşen bir zincir. Ücretsiz katmanda her Flash modelinin günlük istek kotası ayrıdır; zincir toplam kapasiteyi ~5'ten ~35'e çıkarır.

| Sıra | Model | Rol | Günlük kota |
|---|---|---|---|
| 0 | Kural motoru (`RuleTransactionParser`) | Basit cümleler — ücretsiz, anlık, çevrimdışı | ∞ |
| 1 | `gemini-3.8-flash` | Ana chatbot beyni | 5 |
| 2 | `gemini-3.7-flash` | 1 tükenince | 5 |
| 3 | `gemini-3.6-flash` | 2 tükenince | 5 |
| 4 | `gemini-3.5-flash` | 3 tükenince | 5 |
| 5 | `gemini-3.5-flash-lite` | Son çare, en cömert kota | 15 |

Kural motoru HER ZAMAN önce çalışır ve güveni eşiğin üstündeyse hiç ağ çağrısı yapılmaz. Model zinciri yalnızca kural motorunun zorlandığı cümlelerde devreye girer.

**Düşme koşulu:** yalnızca kota/oran hatası (HTTP 429) ve geçici sunucu hatası (5xx). Geçersiz anahtar (401/403) veya bozuk istek (400) zinciri ilerletmez — aynı hata her modelde tekrarlanır ve beş çağrı boşa gider.

### Live API neden kullanılmıyor

`gemini-3.8-live` bu mimariye uymuyor. Sebep zekâsı değil, **bağlantı biçimi**:

- Live API **kalıcı WebSocket (WSS)** gerektirir; istek/cevap HTTP desteklemez. `/api/chat` route handler'ı ise istek alıp cevap dönen, sonra biten bir fonksiyondur.
- Sesli ajanlar için tasarlanmıştır. Bu uygulamada ses **tarayıcıda** (Web Speech API) metne çevriliyor; sunucuya zaten metin gidiyor. Live API'nin asıl değeri olan ses akışı hiç kullanılmayacak, ama bedeli (WebSocket altyapısı) ödenecekti.

İleride "telefonla konuşur gibi" gerçek sesli asistan istenirse `gemini-3.8-live` doğru seçimdir ve ayrı bir yol olarak eklenir. Bu spec'in kapsamı dışındadır.

### Dikte: tarayıcı ses tanıma korunur

`gemini-3.5-transcribe` yedek olarak EKLENMEZ. Web Speech API Chrome/Edge'de ücretsiz ve sınırsız çalışıyor; Transcribe'ın günlük kotası 3 istek, yani Firefox/Safari kullanıcısı için anlamlı bir yedek oluşturmuyor. O tarayıcılarda kullanıcı sohbet kutusuna yazarak devam eder.

### Okuma tarafı

"Bu ay ne harcadım" gibi sorular için Gemini'ye **özet** gönderilir (kategori bazlı toplamlar, bakiyeler), ham işlem listesi değil. Hem token maliyeti düşer hem de dışarı giden veri asgari kalır.

---

## Araç seti

Her araç mevcut (veya Faz 1'de eklenecek) bir hook'un birebir karşılığıdır.

### Okuma araçları — onaysız çalışır

| Araç | Karşılığı | Örnek |
|---|---|---|
| `getBalances` | `useAccountsWithBalances` | "kasada ne kadar var" |
| `getSpending` | `features/reports/aggregate.ts` | "bu ay yemeğe ne harcadım" |
| `getBudgetStatus` | `useBudgetProgress` | "bütçeyi aştım mı" |
| `getDebts` | `useDebtBalances` | "kime borcum var" |
| `findTransactions` | `useTransactionsRange` | "geçen hafta market harcamalarım" |

### Yazma araçları — onay kartı zorunlu

`createTransaction` · `updateTransaction` · `deleteTransaction`
`createAccount` · `updateAccount` · `archiveAccount`
`createCategory` · `updateCategory`
`setBudget` · `deleteBudget`
`createRecurringRule` · `updateRecurringRule` · `deleteRecurringRule`
`createDebt` · `updateDebt` · `addDebtPayment`

---

## Onay kartı (`ActionCard`)

Mevcut `DraftCard` tek bir **yeni** işlem için tasarlanmış. Asistanın niyetleri üç farklı şekilde gelir, bu yüzden `DraftCard` zorlanmaz; yanına `ActionCard` eklenir.

| Niyet türü | Gösterim |
|---|---|
| **Ekleme** | Bugünkü `DraftCard` mantığı — tüm alanlar düzenlenebilir |
| **Güncelleme** | Önce/sonra karşılaştırması: `300,00 ₺ → 250,00 ₺` |
| **Silme** | Silinecek kayıtların listesi + sayısı, kırmızı onay düğmesi |

Toplu işlemde **her satır tek tek işaretlenebilir** — "5 işlem silinecek" denince beşini birden kabul etmek zorunlu değildir.

### Toplu işlem sınırı: 20 kayıt

Tek onayda en fazla 20 kayıt işlenir.

**Gerekçe:** Gemini bir tarih aralığını yanlış anlarsa ("geçen ay" yerine "geçen yıl") 400 kayıtlık bir silme niyeti üretebilir. 400 satırlık kart onayı anlamsızlaştırır — kullanıcı okumadan onaylar ve koruma ortadan kalkar.

Sınır aşıldığında asistan uygulamaz, daraltma ister:

> "412 işlem eşleşti, bu çok geniş görünüyor — hangi kategoriyi kastettin?"

---

## Koyu tema

Token altyapısı hazır olduğu için **bileşenlere hiç dokunulmaz.** Koyu tema `:root`'un yanına ikinci bir değer kümesi olarak gelir.

```css
:root { --bg: oklch(1 0 0); /* … */ }                 /* açık */

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: oklch(0.17 0.01 265); /* … */ }
}
:root[data-theme="dark"] { /* … */ }                   /* manuel seçim */
```

### Üç zorunluluk

1. **Yanıp sönme olmayacak.** Tema tercihi `<head>` içinde, React yüklenmeden önce çalışan küçük bir script ile `<html>` üzerine yazılır. Aksi halde sayfa bir an beyaz parlar — geceleyin koyu temada kullanan için rahatsız edici.
2. **Renkler yeniden hesaplanır, ters çevrilmez.** Koyu zeminde aynı yeşil/kırmızı cansız görünür. Gelir/gider renklerinin lightness ve chroma değerleri koyu için ayrı belirlenir.
3. **Kontrast testleri genişler.** `colors.contrast.test.ts` bugün yalnızca açık temayı doğruluyor. Aynı eşikler koyu tema için de test edilir — özellikle uyarı rengi tuzağı (bütçe aşımı uyarısının kendi yumuşak zemininde okunmaz hale gelmesi) koyu temada tekrar edebilir.

Geçiş düğmesi başlıkta: **Açık / Koyu / Sistem**. `themeColor` meta etiketi temaya göre değişir, böylece telefonda tarayıcı çubuğu uyumlu görünür.

---

## Fazlar

### Faz 1 — Elle düzenleme boşlukları
Asistanın üstüne bineceği temel.

- `useUpdateTransaction`, `useUpdateAccount`
- Kategori düzenleme (ad/tür) + arşivleme
- Düzenleme arayüzleri: işlem satırına dokununca açılan form; hesap ve kategori kartlarında düzenle eylemi
- Her mutation için test

### Faz 2 — Koyu tema
Faz 1'den bağımsız; sırası değiştirilebilir.

- Koyu token kümesi, geçiş düğmesi, flash önleyici script, kontrast testleri

### Faz 3 — Asistan altyapısı
- `/api/chat` route'u, Gemini araç tanımları, niyet şeması ve doğrulaması
- Model zinciri: 429/5xx'te sıradaki modele düşen sarmalayıcı + testleri
- Arayüz yok; testlerle sürülür
- Gemini'nin güncel araç-çağırma API'si `context7` MCP ile doğrulanır, ezberden yazılmaz

### Faz 4 — Sohbet paneli
- Mevcut dikte paneli sohbete dönüşür: mesaj listesi, metin kutusu, yanında mikrofon düğmesi
- `useSpeechRecognition` aynen korunur
- `ActionCard` sohbet akışı içinde belirir

### Faz 5 — Cilalama
- Erişilebilirlik denetimi (sohbet paneli klavye ve ekran okuyucuyla çalışmalı)
- Maliyet sınırlama, hata durumları

---

## Test yaklaşımı

| Katman | Test |
|---|---|
| Mutation'lar | Birim testleri — doğrulama, hata çevirisi, önbellek geçersiz kılma |
| Niyet şeması | Birim testleri — bozuk/tanımsız araç çağrıları reddedilmeli |
| Toplu sınır | Birim testi — 20 üstü niyet uygulanmamalı |
| Koyu tema | Kontrast testleri, her iki tema için |
| Sohbet paneli | Erişilebilirlik (axe) + klavye gezinme |

---

## Kapsam dışı

- Bütçe / düzenli ödeme / borç mutation'ları (zaten tam)
- Geri alma (undo) altyapısı — onay kartı bu ihtiyacı karşılıyor
- Asistanın çok kullanıcılı veya paylaşımlı kullanımı
- Sesli **yanıt** (asistan konuşmaz, yalnızca dinler ve yazar)
