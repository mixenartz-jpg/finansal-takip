-- ═══════════════════════════════════════════════════════════════════
-- 0010 — Kullanımdaki kategorinin TÜRÜ değiştirilemez
--
-- ── BELİRTİ ──
--
-- Kategori düzenleme formu türü değiştirmeye izin veriyordu.
-- "Kira" (gider, 40 işleme bağlı) gelire çevrildiğinde hiçbir
-- şey şikâyet etmiyor, güncelleme sessizce geçiyordu.
--
-- Sonuç: 40 işlem hâlâ `kind = 'expense'` ama artık gelir
-- etiketli bir kategoriye bakıyor. Kategori dağılımı raporu
-- geçmiş veriyi yanlış tarafta gösteriyor. Daha kötüsü, o eski
-- işlemlerden biri sonradan düzenlenmek istendiğinde
-- `transactions_check_category_kind` devreye giriyor ve
-- "Kategori türü işlem türüyle uyuşmuyor" hatası veriyor —
-- kullanıcının o an yaptığı düzenlemeyle hiç ilgisi olmayan,
-- anlaşılmaz bir hata.
--
-- ── KÖK NEDEN ──
--
-- `check_category_kind` (0003) `transactions` üzerinde;
-- `check_budget_category_kind` (0006) `budgets` üzerinde;
-- `check_recurring_category_kind` (0007) `recurring` üzerinde
-- çalışıyor. ÜÇÜ DE bağımlı satır yazılırken kategoriye bakıyor.
--
-- Hiçbiri kategorinin KENDİSİ değiştiğinde tetiklenmiyor. Yani
-- kural "yanlış kategoriyi işleme bağlayamazsın" diyordu, ama
-- "işlemin altından kategoriyi çekip alamazsın" demiyordu.
--
-- `queries.ts` içindeki `useUpdateCategory` yorumu var olmayan
-- bir güvenlik ağına güveniyordu; bu migration o ağı gerçekten
-- kuruyor.
--
-- ── KARAR ──
--
-- Tür değişimi, kategoriye bağlı KAYIT VARSA reddedilir. Bağlı
-- kayıt yoksa serbesttir (yeni açılmış bir kategorinin türü
-- yanlış seçilmişse düzeltilebilmeli).
--
-- Ad ve anahtar kelime değişimi her zaman serbest — yalnızca
-- `kind` alanı korunuyor.
--
-- Alternatif olarak "türü değiştir + bağlı işlemleri de çevir"
-- düşünülebilirdi; reddedildi, çünkü bir gider işlemini gelire
-- çevirmek bakiyeyi ters yönde oynatır ve kullanıcının niyeti
-- neredeyse hiçbir zaman bu değildir. Kullanıcı gerçekten
-- istiyorsa eski kategoriyi arşivleyip yenisini açar.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.check_category_kind_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  used_by text;
begin
  -- Tür değişmiyorsa kontrol edecek bir şey yok: ad/anahtar
  -- kelime güncellemeleri bu kapıdan bedelsiz geçer.
  if new.kind = old.kind then
    return new;
  end if;

  select case
    when exists (select 1 from public.transactions where category_id = old.id) then 'işlem'
    when exists (select 1 from public.budgets      where category_id = old.id) then 'bütçe'
    when exists (select 1 from public.recurring_rules where category_id = old.id) then 'düzenli ödeme'
  end into used_by;

  if used_by is not null then
    raise exception
      'Kullanımdaki kategorinin türü değiştirilemez (bağlı kayıt: %). Kategoriyi arşivleyip yenisini açın.',
      used_by;
  end if;

  return new;
end; $$;

-- `drop ... if exists`: bu migration Supabase SQL Editor'a ELLE
-- yapıştırılarak çalıştırılıyor (projede CLI yok). Yanlışlıkla
-- ikinci kez çalıştırmak "trigger already exists" hatası vermesin;
-- fonksiyon zaten `create or replace`.
drop trigger if exists categories_check_kind_immutable on public.categories;

create trigger categories_check_kind_immutable
  before update on public.categories
  for each row execute function public.check_category_kind_immutable();
