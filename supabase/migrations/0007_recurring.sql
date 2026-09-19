-- ═══════════════════════════════════════════════════════════════════
-- 0007 — Tekrarlayan işlemler (Faz 3)
--
-- Kira, maaş, abonelik gibi düzenli aralıklarla tekrar eden
-- işlemlerin ŞABLONU. Şablonun kendisi bir işlem değildir; vakti
-- gelince kullanıcı onayıyla `transactions` satırı üretir.
--
-- ── NEDEN OTOMATİK DEĞİL (ürün kararı) ──
--
-- Vakti gelen işlem SESSİZCE kaydedilmez. Kirayı bu ay geç ödediyseniz
-- ya da tutar değiştiyse, otomatik kayıt bakiyeyi yalancı yapar ve
-- kullanıcı bunu fark etmeden haftalarca yanlış rakama bakar.
-- Onay adımı bir saniye alır; yanlış bakiyeyi fark etmek ayları alır.
--
-- ── ÜRETİM İZİ NEREDE TUTULUR ──
--
-- `last_run_date`: bu kurala göre EN SON hangi tarih için işlem
-- üretildiği. Üretim idempotent olsun diye: istemci "son üretimden
-- bugüne" aralığını hesaplar ve aynı dönemi iki kez yazmaz. Ayrıca
-- üretilen işlem `transactions.recurring_id` ile şablona bağlanır,
-- böylece "bu kira ödemesi hangi şablondan geldi" izi kaybolmaz.
-- ═══════════════════════════════════════════════════════════════════

create type public.recur_freq as enum ('weekly', 'monthly', 'yearly');

create table public.recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  name          text not null check (length(trim(name)) between 1 and 80),

  -- Transfer şablonu YOK: iki hesaplı bir tekrarı doğru kurmak
  -- (hangi hesap kaynak, hangisi hedef, limit değişirse ne olur)
  -- bu fazın kapsamını aşıyor ve kullanıcı isteğinde geçmiyor.
  kind          public.transaction_kind not null check (kind <> 'transfer'),

  amount_kurus  bigint not null check (amount_kurus > 0),

  account_id    uuid not null references public.accounts (id) on delete restrict,
  category_id   uuid references public.categories (id) on delete set null,

  note          text check (note is null or length(note) <= 500),

  freq          public.recur_freq not null,

  -- Dönem içindeki konum:
  --   weekly  → ISO hafta günü (1=Pazartesi … 7=Pazar)
  --   monthly → ayın günü (1-31; kısa aylarda ayın son gününe kırpılır)
  --   yearly  → ayın günü (`month_of` ile birlikte)
  day_of        smallint not null check (day_of between 1 and 31),

  -- Yalnızca yearly için: hangi ay (1-12).
  month_of      smallint check (month_of between 1 and 12),

  start_date    date not null,
  end_date      date,

  -- Bu kurala göre en son üretilen işlemin tarihi. NULL = hiç
  -- üretilmedi. Üretim penceresi bu tarihten SONRA başlar.
  last_run_date date,

  -- Duraklatılmış kural vade üretmez ama silinmemiştir.
  paused_at     timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- weekly'de gün 1-7 olmalı; 1-31 aralığı yalnızca monthly/yearly
  -- için anlamlı. Aksi halde "her 25. gün haftalık" gibi
  -- yorumlanamayan bir kural kurulabilirdi.
  constraint weekly_day_in_range check (
    freq <> 'weekly' or day_of between 1 and 7
  ),

  -- `month_of` VE YALNIZCA yearly'de dolu olmalı.
  constraint month_of_only_yearly check (
    (freq = 'yearly') = (month_of is not null)
  ),

  constraint end_after_start check (end_date is null or end_date >= start_date)
);

create index recurring_user_idx
  on public.recurring_rules (user_id, paused_at nulls first, start_date);

-- ── transactions ile bağ ──
-- Üretilen işlem şablonuna bağlanır. `set null`: şablon silinse de
-- geçmiş işlem kaybolmaz, yalnızca izini yitirir.
alter table public.transactions
  add column recurring_id uuid references public.recurring_rules (id) on delete set null;

create index transactions_recurring_idx
  on public.transactions (user_id, recurring_id)
  where recurring_id is not null;

-- ─────────────────────────────── RLS ────────────────────────────────
alter table public.recurring_rules enable row level security;

create policy recurring_select on public.recurring_rules
  for select to authenticated using ((select auth.uid()) = user_id);
create policy recurring_insert on public.recurring_rules
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy recurring_update on public.recurring_rules
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy recurring_delete on public.recurring_rules
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ★ Sahiplik sertleştirmesi — 0002 ve 0006 ile aynı desen.
alter table public.recurring_rules
  add constraint recurring_id_user_uk unique (id, user_id),
  add constraint recurring_account_same_owner
    foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  add constraint recurring_category_same_owner
    foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null;

-- Üretilen işlem de aynı kullanıcının şablonuna bağlanmalı.
alter table public.transactions
  add constraint transactions_recurring_same_owner
    foreign key (recurring_id, user_id)
    references public.recurring_rules (id, user_id) on delete set null;

-- ───────────────────────────── Trigger'lar ──────────────────────────
create trigger recurring_stamp_user_id
  before insert on public.recurring_rules
  for each row execute function public.stamp_user_id();

create trigger recurring_touch_updated_at
  before update on public.recurring_rules
  for each row execute function public.touch_updated_at();

-- ★ Kategori türü ile kural türü uyumlu olmalı.
-- `transactions` üzerindeki `check_category_kind`'ın şablon karşılığı:
-- uyumsuz bir şablon, ürettiği her işlemde patlayan bir tuzak olurdu.
create or replace function public.check_recurring_category_kind()
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
      'Kategori türü kural türüyle uyuşmuyor: kural=%, kategori=%',
      new.kind, cat_kind;
  end if;

  return new;
end; $$;

create trigger recurring_check_category_kind
  before insert or update on public.recurring_rules
  for each row execute function public.check_recurring_category_kind();
