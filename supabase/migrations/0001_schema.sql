-- ═══════════════════════════════════════════════════════════════════
-- 0001 — Şema: hesaplar, kategoriler, işlemler
--
-- ÜÇ TEMEL KARAR:
--
-- 1. PARA = bigint, BİRİM KURUŞ. float ASLA.
--    Gerekçe: 0.1+0.2 !== 0.3 ay sonunda "1 kuruş açık" gösterir ve
--    kullanıcı bunu gördüğü an uygulamanın TÜM rakamlarına güvenmeyi
--    bırakır. numeric bile değil — supabase-js numeric'i STRING
--    döndürür ve her sınırda çeviri gerektirirdi.
--
-- 2. HESAP BAKİYESİ SÜTUN DEĞİL, TÜRETİLİR. `accounts.balance`
--    yoktur (bkz. 0005_views.sql). İki doğruluk kaynağı (sütun +
--    hareketler) kaçınılmaz olarak ayrışır: bir işlem silinince
--    sütunu güncellemeyi unutan tek kod yolu yeter.
--
-- 3. TRANSFER = TEK SATIR, iki hesap FK'siyle. İki ayrı işlem satırı
--    yazmak, birini silip diğerini bırakan her yolu veri bozulmasına
--    çevirirdi ve raporlarda transferler gelir+gider olarak iki kez
--    sayılırdı.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────── accounts ──────────────────────────────
create type public.account_kind as enum ('cash', 'bank', 'credit_card');

create table public.accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 60),
  kind           public.account_kind not null,

  -- Açılış bakiyesi, kuruş. Uygulamayı kullanmaya başladığın andaki
  -- tutar. Kredi kartında NEGATİF olur (borç), bu yüzden > 0 kısıtı yok.
  opening_kurus  bigint not null default 0,

  -- Kredi kartı limiti, kuruş. Yalnızca kind='credit_card' anlamlı.
  credit_limit_kurus bigint
    check (credit_limit_kurus is null or credit_limit_kurus > 0),

  -- Arayüzdeki renk yuvası. Ham hex DEĞİL: renkler tasarım
  -- token'larından gelir, veritabanı yalnızca hangi yuva olduğunu
  -- bilir. Tema değişince kayıtlı hex'ler yanlış renk gösterirdi.
  color_slot     smallint not null default 0 check (color_slot between 0 and 7),
  sort_order     integer not null default 0,

  -- Silmek yerine arşivle: geçmiş işlemler hesaba bağlı kalır.
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),

  constraint credit_limit_only_on_card check (
    credit_limit_kurus is null or kind = 'credit_card'
  )
);

create index accounts_user_sort_idx
  on public.accounts (user_id, archived_at nulls first, sort_order);

-- ─────────────────────────── categories ─────────────────────────────
create type public.category_kind as enum ('income', 'expense');

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40),

  -- Gelir ve gider kategorileri AYRI kümeler. "Yemek" bir gelir
  -- kategorisi olarak seçilebilseydi, kategori dağılımı raporu
  -- anlamsız satırlar üretirdi.
  kind        public.category_kind not null,

  icon        text check (icon is null or length(icon) <= 8),
  color_slot  smallint not null default 0 check (color_slot between 0 and 7),

  -- ★ SESLİ GİRİŞ KÖPRÜSÜ.
  -- Parser'ın bu kategoriye eşleyeceği EK anahtar kelimeler.
  -- Yerleşik sözlük (category-lexicon.ts) koddadır ve herkes için
  -- aynıdır; bu sütun KULLANICIYA ÖZEL eklemedir: "migros" kelimesi
  -- onun "Gıda" kategorisine gitsin diye. Kodda tutulamaz — kullanıcı
  -- kategorilerini kendi adlandırır.
  keywords    text[] not null default '{}',

  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),

  -- Aynı isim aynı türde iki kez olamaz. Türler arası olabilir:
  -- "Diğer" hem gelirde hem giderde makul.
  unique (user_id, kind, name)
);

create index categories_user_kind_idx
  on public.categories (user_id, kind, archived_at nulls first, sort_order);

-- ─────────────────────────── transactions ───────────────────────────
create type public.transaction_kind as enum ('income', 'expense', 'transfer');

create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  kind         public.transaction_kind not null,

  -- TUTAR DAİMA POZİTİF, kuruş. İşaret `kind`'dan türetilir.
  -- Negatif tutara izin verilseydi "-200 gider" ile "+200 gelir"
  -- aynı şeyi iki farklı biçimde ifade eder, her toplam sorgusu iki
  -- olasılığı da düşünmek zorunda kalırdı.
  amount_kurus bigint not null check (amount_kurus > 0),

  -- Takvim tarihi, SAAT YOK. Gerekçe: DateStr doktrini
  -- (src/lib/date/types.ts). timestamptz olsaydı UTC+3 yüzünden
  -- gece 00:30'da girilen işlem dünkü güne düşerdi.
  date         date not null,

  -- Para hangi hesaptan çıkar / hangisine girer.
  --   income   → account_id dolu, counter_account_id NULL
  --   expense  → account_id dolu, counter_account_id NULL
  --   transfer → account_id = KAYNAK, counter_account_id = HEDEF
  --
  -- on delete restrict: bir hesabı silmek geçmiş işlemleri
  -- buharlaştırmamalı. Kullanıcı önce arşivler.
  account_id         uuid not null references public.accounts (id) on delete restrict,
  counter_account_id uuid references public.accounts (id) on delete restrict,

  -- on delete set null: kategorisi silinen işlem kaybolmaz,
  -- "kategorisiz" olur.
  category_id  uuid references public.categories (id) on delete set null,

  note         text check (note is null or length(note) <= 500),

  -- ★ SES İZİ. İşlem sesle girildiyse ham transkript burada durur.
  -- Neden saklanır:
  --   (a) kullanıcı "ne demiştim" diye bakabilir,
  --   (b) parser geliştirilirken UYDURMA test cümleleri yerine
  --       kullanıcının KENDİ konuşması korpus olur.
  voice_transcript text
    check (voice_transcript is null or length(voice_transcript) <= 1000),

  -- Hangi kaynak üretti.
  source       text not null default 'manual'
               check (source in ('manual','voice','recurring','import')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- ŞEKİL KISITI — bozuk satır veritabanına HİÇ girmesin.
  -- Uygulama katmanındaki bir hata bile geçersiz transfer yazamaz.
  constraint transfer_shape check (
    case kind
      when 'transfer' then
        counter_account_id is not null
        and counter_account_id <> account_id
        and category_id is null      -- transferin kategorisi olmaz
      else
        counter_account_id is null
    end
  )
);

-- Listeleme ve rapor sorgularının TEK şekli: (user_id, tarih aralığı).
-- INCLUDE ile toplamlar index-only scan'den çıkabilir.
create index transactions_user_date_idx
  on public.transactions (user_id, date desc)
  include (kind, amount_kurus, account_id, category_id);

-- Hesap bakiyesi türetimi bu indeksten okur.
create index transactions_account_idx
  on public.transactions (user_id, account_id, date);

-- Transferin HEDEF ayağı; kısmi indeks çünkü satırların çoğunda NULL.
create index transactions_counter_account_idx
  on public.transactions (user_id, counter_account_id, date)
  where counter_account_id is not null;

-- Bütçe ilerlemesi ve kategori dağılımı.
create index transactions_category_idx
  on public.transactions (user_id, category_id, date)
  where category_id is not null;
