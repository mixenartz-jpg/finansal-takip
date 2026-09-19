# Hesap Takip

Konuşarak işlem ekleyebildiğiniz kişisel finans takibi.

Mikrofona *"200 tl yemek aldım"* dediğinizde uygulama bunu **gider · 200 ₺ · Yemek · bugün** olarak ayrıştırır, onayınıza sunar ve kaydeder. Yapay zeka gerektirmez.

---

## Kurulum

### 1. Supabase projesi oluşturun

1. [supabase.com](https://supabase.com) → yeni proje
2. Proje oluşunca **Settings → API** sayfasından şunları alın:
   - `Project URL`
   - `anon` / `public` anahtarı

> **Uyarı:** `service_role` anahtarını **hiçbir zaman** bu projeye koymayın. RLS'i tamamen devre dışı bırakır ve tek bir `NEXT_PUBLIC_` öneki uzaklıktadır.

### 2. Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 3. Veritabanı şemasını kurun

Supabase panelinde **SQL Editor**'ü açın ve `supabase/migrations/` altındaki dosyaları **sırayla** çalıştırın:

```
0001_schema.sql              → hesaplar, kategoriler, işlemler
0002_rls.sql                 → satır düzeyi güvenlik + sahiplik sertleştirmesi
0003_triggers.sql            → user_id damgası, kategori türü denetimi
0004_views.sql               → bakiye ve rapor görünümleri
0005_seed_categories.sql     → yeni kullanıcıya varsayılan kategoriler
0006_budgets.sql             → aylık bütçe limitleri + ilerleme görünümü
0007_recurring.sql           → tekrarlayan işlem şablonları
```

Sıra **önemlidir** — her dosya öncekine dayanır.

### 4. Çalıştırın

```bash
npm install
npm run dev
```

http://localhost:3000 → hesap oluşturun. Kayıt olduğunuzda varsayılan kategoriler ve bir "Nakit" hesabı otomatik oluşur.

---

## Sesli giriş

### Nasıl kullanılır

Sağ alttaki mikrofon düğmesine dokunup işlemi söyleyin. Uygulama **asla otomatik kaydetmez** — her zaman düzenleyebileceğiniz bir onay kartı gösterir.

### Anladığı cümleler

| Söyleyin | Anladığı |
|---|---|
| "200 tl yemek aldım" | Gider · 200 ₺ · Yemek · bugün |
| "bugün 40 bin tl para geldi" | Gelir · 40.000 ₺ · bugün |
| "kırk bin lira maaş yattı" | Gelir · 40.000 ₺ · Maaş |
| "dün markete 350 lira verdim" | Gider · 350 ₺ · Market · dün |
| "kartla 1.250,50 tl fatura ödedim" | Gider · 1.250,50 ₺ · Fatura · Kredi Kartı |
| "yüz elli tl taksi" | Gider · 150 ₺ · Ulaşım |
| "15 mart kira ödedim 4500 tl" | Gider · 4.500 ₺ · Kira · 15 Mart |
| "1000 tl havale yaptım" | Transfer · 1.000 ₺ |

**Sayılar:** hem rakam ("40.000", "1.250,50") hem yazı ("kırk bin", "yüz elli", "iki buçuk milyon") hem de karışık ("15 bin tl") kabul edilir.

**Tarihler:** bugün · dün · evvelsi gün · geçen hafta · geçen ay · 15 mart · pazartesi

**Hesaplar:** kartla · nakit · bankadan · elden — ya da hesabınızın adını söyleyin.

### Emin olmadığında sorar

`"aldım"` Türkçede hem satın almak hem edinmek demektir. Parser nesneye bakar:

- "200 tl **yemek** aldım" → gider (yemek bir gider kategorisi)
- "**maaşımı** aldım" → gelir (maaş para akışını adlandırır)
- yalın "aldım" → **boş bırakır ve size sorar**

Bu bilinçli bir tercih: yanlış tahmini sessizce kaydetmek, aylar sonra fark edeceğiniz bozuk veri üretir.

### Tarayıcı desteği

Sesli giriş **Chrome ve Edge**'de çalışır (Web Speech API). Safari ve Firefox'ta mikrofon düğmesi gösterilmez, uygulama manuel girişle tam olarak çalışmaya devam eder.

HTTPS veya `localhost` gerekir — tarayıcı güvensiz bağlantıda mikrofona izin vermez.

---

## Bütçe

Kategori başına **aylık** harcama limiti koyarsınız; harcadıkça ne kadar kaldığını görürsünüz.

**Bütçe bir hedeftir, yasak değil.** Limiti aşan bir işlem normal şekilde kaydedilir — gerçekten yapılmış bir harcamayı kayıt dışı bırakmak tüm bakiyeleri yalancı yapardı. Aşım yalnızca *görünür* olur:

| Durum | Gösterim |
|---|---|
| Limitin %85'inin altında | Nötr çubuk, "3.200 ₺ kaldı" |
| %85 ve üstü | Sarı çubuk, "380 ₺ kaldı" |
| Limit tam doldu | Kırmızı çubuk, "Limit doldu" |
| Limit aşıldı | Kırmızı çubuk, "815 ₺ aştınız" |

Aşım varsa panelde de bir uyarı çıkar, bütçe sayfasına girmeden görürsünüz.

**Bütçeler aya özeldir.** Her ay kendi limitlerini taşır; yeni ay başında **"Geçen aydan kopyala"** ile tek tıkla taşıyabilirsiniz. Otomatik kopyalanmaz — geçen ay tatil için yükselttiğiniz bir limit bu aya sessizce taşınmamalı.

Bütçe yalnızca **gider** kategorilerine konur. "Maaş bütçem 50.000" bir hedef değil dilektir, ve aşım uyarısı ters anlam taşırdı (çok maaş almak kötü değildir).

---

## Düzenli işlemler

Kira, maaş, abonelik gibi tekrar eden işlemleri bir kez tanımlarsınız; vakti gelince onayınıza sunulur.

**Otomatik kaydedilmez.** Vadesi gelen işlem panelde ve Düzenli sayfasında listelenir, üç seçeneğiniz olur:

| Seçenek | Ne olur |
|---|---|
| **Onayla** | İşlem kaydedilir, bakiye ve bütçe güncellenir |
| **Atla** | Vade kapanır ama işlem oluşmaz — "bu ay ödemedim" |
| Dokunmamak | Listede bekler |

Bu bilinçli bir tercih: kirayı geç ödediyseniz ya da tutar değiştiyse, otomatik kayıt bakiyenizi yalancı yapar ve fark etmeniz haftalar alır.

**Sıklıklar:** haftalık · aylık · yıllık. Başlangıç tarihi zorunlu, bitiş tarihi isteğe bağlı (boş = süresiz). Kuralı geçici olarak **duraklatabilirsiniz**.

**Ayın 31'i sorunu çözülmüş:** "Her ayın 31'i" kuralı şubatta 28'e (artık yılda 29'a) kırpılır, ama sonraki ay yine 31'e döner — kural kalıcı olarak kaymaz. Formda 31 seçeneği "Son gün" diye görünür.

Uygulamayı bir süre açmadıysanız biriken vadelerin hepsi listelenir, tek tek onaylarsınız.

---

## Yapay zeka eklemek (isteğe bağlı)

Kural motoru AI olmadan çalışır. Zor cümleler için Gemini eklemek isterseniz **arayüz hazır bekliyor**:

1. `src/features/parser/llm/gemini-parser.ts` oluşturun, `TransactionParser` arayüzünü uygulayın:

```ts
export class GeminiTransactionParser implements TransactionParser {
  readonly name = "gemini";
  async parse(text: string, ctx: ParseContext): Promise<ParseResult> { ... }
}
```

2. `src/features/dictation/DictationSheet.tsx` içinde:

```ts
const parser = createParser({ fallback: new GeminiTransactionParser() });
```

Zincir, kural motorunun güveni `CONFIDENCE_THRESHOLD` (0.6) altında kaldığında Gemini'ye düşer; üstündeyse **ağ çağrısı yapmaz**. Gemini hata verirse dikte kural motoru sonucuyla çalışmaya devam eder.

> API anahtarını `GEMINI_API_KEY` olarak **sunucu tarafında** tutun, `NEXT_PUBLIC_` öneki **kullanmayın** — yoksa anahtar tarayıcıya gönderilen pakete gömülür. LLM çağrısını bir route handler üzerinden yapın.

---

## Komutlar

```bash
npm run dev            # geliştirme sunucusu
npm run build          # üretim derlemesi
npm test               # birim testler
npm run test:coverage  # kapsam raporu
npm run typecheck      # tip denetimi
npm run e2e            # uçtan uca testler (Playwright)
```

---

## Mimari notlar

**Para `bigint` kuruş olarak saklanır, float asla.** `0.1 + 0.2 !== 0.3` bir bütçe uygulamasında ay sonunda "1 kuruş açık" gösterir ve tüm rakamlara duyulan güveni bitirir. TypeScript tarafında markalı `Kurus` tipi lira ile kuruşun karışmasını derleme zamanında engeller.

**Hesap bakiyesi sütun değil, türetilir.** `accounts.balance` yoktur; bakiye `account_balances` görünümünde her okumada hareketlerden hesaplanır. İki doğruluk kaynağı kaçınılmaz olarak ayrışır.

**Transfer tek satırdır.** Kaynak ve hedef hesap aynı satırda; iki ayrı işlem yazmak raporlarda çift sayıma ve yarım silmeye yol açardı.

**Tarihler `DateStr` ('YYYY-MM-DD') olarak taşınır.** `Date` nesnesi yalnızca `src/lib/date/` içinde kurulur, `toISOString()` hiç kullanılmaz — Türkiye UTC+3 olduğu için gece 00:30'da girilen işlem dünkü güne düşerdi.

---

## Yol haritası

Faz 1 (tamamlandı): auth · hesaplar · kategoriler · işlemler · **sesli giriş**

Faz 2 (tamamlandı): **aylık bütçe limitleri** · ilerleme çubuğu · aşım uyarısı

Faz 3 (tamamlandı): **tekrarlayan işlemler** · vade onayı · duraklatma

Sonraki fazlar: borç/alacak takibi · raporlar ve grafikler · CSV dışa aktarma · cilalama
