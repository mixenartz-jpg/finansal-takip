-- ═══════════════════════════════════════════════════════════════════
-- 0003 — Trigger'lar
--
-- `set search_path = ''` HER fonksiyonda var: boş search_path,
-- fonksiyonun şema adı olmadan bir nesneye erişmesini imkânsız kılar.
-- Aksi halde saldırgan kendi şemasında sahte bir `categories` tablosu
-- oluşturup fonksiyonu kandırabilir (search_path hijacking).
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────── user_id'yi oturumdan damgala ───────────────────────
-- İstemci `user_id` GÖNDERMEZ. Gönderse bile bu trigger üzerine yazar.
-- Tek bir unutulmuş insert bile başkasının verisine yazmaya yol
-- açamaz; RLS'in `with check`'i ikinci savunma hattı olarak kalır.
create or replace function public.stamp_user_id()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.user_id := auth.uid();
  return new;
end; $$;

create trigger accounts_stamp_user_id
  before insert on public.accounts
  for each row execute function public.stamp_user_id();

create trigger categories_stamp_user_id
  before insert on public.categories
  for each row execute function public.stamp_user_id();

create trigger transactions_stamp_user_id
  before insert on public.transactions
  for each row execute function public.stamp_user_id();

-- ─────────────────────── updated_at damgası ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- ★ Kategori türü ile işlem türü uyumlu olmalı.
--
-- `check` kısıtı bunu YAPAMAZ: başka bir tabloya bakması gerekiyor ve
-- check kısıtları alt sorgu içeremez. Trigger yapar.
--
-- Olmasaydı: bir gelir işlemine "Yemek" (gider kategorisi) atanabilir,
-- kategori dağılımı raporu gelir tarafında "Yemek" satırı gösterirdi.
-- Parser bu kuralı TS tarafında da uygular (corpus.test.ts), ama
-- son söz veritabanınındır — elle yazılan SQL de bu kurala tabi.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.check_category_kind()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  cat_kind public.category_kind;
begin
  if new.category_id is null then
    return new;
  end if;

  select kind into cat_kind
    from public.categories
   where id = new.category_id;

  if (new.kind = 'income'  and cat_kind <> 'income')
  or (new.kind = 'expense' and cat_kind <> 'expense') then
    raise exception
      'Kategori türü işlem türüyle uyuşmuyor: işlem=%, kategori=%',
      new.kind, cat_kind;
  end if;

  return new;
end; $$;

create trigger transactions_check_category_kind
  before insert or update on public.transactions
  for each row execute function public.check_category_kind();
