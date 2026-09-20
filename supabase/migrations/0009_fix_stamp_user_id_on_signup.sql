-- ═══════════════════════════════════════════════════════════════════
-- 0009 — `stamp_user_id` kayıt anında seed'i bozmasın
--
-- ── BELİRTİ ──
--
-- Kayıt olurken HTTP 500:
--   null value in column "user_id" of relation "categories"
--   violates not-null constraint
--
-- Kullanıcıya "Bağlantınızı kontrol edin" diye görünüyordu; ağ
-- sorunu DEĞİLDİ.
--
-- ── KÖK NEDEN ──
--
-- İki trigger aynı satır üzerinde çakışıyordu:
--
--   1. `seed_default_categories` — AFTER INSERT on auth.users.
--      `new.id`'yi doğru şekilde user_id olarak veriyor.
--
--   2. `stamp_user_id` — BEFORE INSERT on categories/accounts.
--      Koşulsuz `new.user_id := auth.uid()` yapıyordu ve (1)'in
--      verdiği doğru değeri EZİYORDU.
--
-- Kayıt anında henüz oturum yok → `auth.uid()` NULL döner → not-null
-- kısıtı patlar → signup tamamen başarısız olur. 0005'in başlığındaki
-- not bu durumu öngörmüş ama kod bunu engellemiyordu.
--
-- ── DÜZELTME ──
--
-- Damgalama yalnızca ORTADA BİR OTURUM VARKEN yapılır. Güvenlik amacı
-- korunur: oturumlu bir istemci `user_id` göndermeye çalışırsa değer
-- yine ezilir, yani kimse başkasının satırına yazamaz. Oturum yokken
-- (yalnızca `security definer` seed trigger'ı bu durumda çalışır)
-- fonksiyon satıra dokunmaz.
--
-- `insert ... on conflict` YOK: bu bir davranış düzeltmesi, veri
-- taşıması değil. Mevcut satırlar etkilenmez.
--
-- NOT: RLS'in `with check (user_id = auth.uid())` kuralı ikinci
-- savunma hattı olarak aynen yerinde duruyor — oturumlu yollarda
-- yanlış user_id hâlâ reddedilir.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.stamp_user_id()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Oturum varsa: istemcinin gönderdiği değeri yok say, oturumdan damgala.
  -- Oturum yoksa: satır `security definer` seed trigger'ından geliyordur,
  -- user_id'si zaten doğrudur; dokunma.
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end; $$;
