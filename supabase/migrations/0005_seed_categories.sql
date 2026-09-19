-- ═══════════════════════════════════════════════════════════════════
-- 0005 — Yeni kullanıcıya varsayılan kategori seti
--
-- ── NEDEN ŞART ──
--
-- Sesli giriş kategorileri EŞLEŞTİREREK çalışır. Boş kategori
-- listesiyle parser hiçbir şeyi eşleyemez ve kullanıcının ilk
-- deneyimi "dikte kategoriyi bulamadı" olur. Kayıt olur olmaz
-- çalışan bir sistem, kurulum isteyen bir sistemden iyidir.
--
-- Kategori adları `category-lexicon.ts` içindeki `category` alanıyla
-- BİREBİR aynı olmalı: parser yerleşik sözlükteki eşleşmeyi bu adla
-- kullanıcının gerçek kategorisine bağlıyor. Biri değişirse diğeri de
-- değişmeli.
--
-- `keywords` sütunu burada da doldurulur ama yerleşik sözlüğün
-- KOPYASI DEĞİL: bunlar kullanıcının sonradan düzenleyebileceği
-- başlangıç değerleri. Yerleşik sözlük koda gömülüdür ve her kullanıcı
-- için aynıdır.
--
-- `security definer` GEREKLİ: trigger `auth.users` üzerinde çalışır ve
-- o anda henüz `authenticated` oturum bağlamı yoktur, `stamp_user_id`
-- deseni burada işlemez. `user_id` doğrudan `new.id`'den gelir.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.seed_default_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories (user_id, name, kind, color_slot, sort_order, keywords) values
    -- ── Gelir ──
    (new.id, 'Maaş',     'income', 0, 0, '{maas,maasim,ucret,aylik}'),
    (new.id, 'Ek Gelir', 'income', 1, 1, '{ek gelir,prim,ikramiye,bonus,freelance}'),
    (new.id, 'Faiz',     'income', 2, 2, '{faiz,getiri,temettu,kar payi,mevduat}'),
    (new.id, 'Diğer',    'income', 7, 9, '{}'),

    -- ── Gider ──
    (new.id, 'Yemek',    'expense', 0, 0, '{yemek,restoran,lokanta,kahvalti,kahve,kafe}'),
    (new.id, 'Market',   'expense', 1, 1, '{market,bakkal,manav,migros,bim,a101,sok,carrefour}'),
    (new.id, 'Ulaşım',   'expense', 2, 2, '{ulasim,otobus,metro,taksi,benzin,yakit,akbil,istanbulkart}'),
    (new.id, 'Fatura',   'expense', 3, 3, '{fatura,elektrik,dogalgaz,internet,telefon,aidat}'),
    (new.id, 'Kira',     'expense', 4, 4, '{kira,ev kirasi}'),
    (new.id, 'Sağlık',   'expense', 5, 5, '{saglik,doktor,eczane,ilac,hastane,dis}'),
    (new.id, 'Giyim',    'expense', 6, 6, '{giyim,kiyafet,ayakkabi,pantolon,gomlek}'),
    (new.id, 'Eğlence',  'expense', 0, 7, '{eglence,sinema,konser,netflix,spotify,abonelik}'),
    (new.id, 'Eğitim',   'expense', 1, 8, '{egitim,kurs,kitap,ders,okul,universite}'),
    (new.id, 'Diğer',    'expense', 7, 9, '{}');

  -- ── Varsayılan hesap ──
  -- Hesapsız işlem girilemez (account_id not null). Kullanıcı önce
  -- hesap oluşturmaya zorlanırsa, ilk dikte denemesi başarısız olur.
  insert into public.accounts (user_id, name, kind, opening_kurus, color_slot, sort_order)
  values (new.id, 'Nakit', 'cash', 0, 0, 0);

  return new;
end; $$;

create trigger on_auth_user_created_seed
  after insert on auth.users
  for each row execute function public.seed_default_categories();
