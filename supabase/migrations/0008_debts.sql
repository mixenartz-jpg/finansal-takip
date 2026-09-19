-- ═══════════════════════════════════════════════════════════════════
-- 0008 — Borç / alacak takibi (Faz 4)
--
-- "Kime ne kadar borçluyum, kim bana ne kadar borçlu ve ne kadarı
-- ödendi" sorusunun cevabı.
--
-- ── İKİ TEMEL KARAR ──
--
-- 1. KAPANMA SÜTUNU YOK. "Bu borç kapandı mı" = ödemeler toplamı
--    anaparaya ulaştı mı. Ayrı bir `closed` boolean, bir ödeme
--    silinince yalan söylerdi. Aynı doktrin `accounts.balance`
--    sütununun olmayışında da var (0004_views.sql).
--
-- 2. ÖDEME, İŞLEME BAĞLANABİLİR AMA ZORUNLU DEĞİL. Borcu bankadan
--    ödediyseniz bakiyeniz de düşmeli; elden verdiyseniz düşmemeli.
--    `transaction_id` bu ayrımı taşır ve NULL olabilir.
-- ═══════════════════════════════════════════════════════════════════

-- 'payable'    = BEN borçluyum (kime borcum var)
-- 'receivable' = BANA borçlular (kim bana borçlu)
create type public.debt_direction as enum ('payable', 'receivable');

create table public.debts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  direction       public.debt_direction not null,

  -- Karşı taraf yalnızca bir METİN. Ayrı bir "kişiler" tablosu
  -- kurmak bu uygulamanın kapsamını aşar: kullanıcı bireysel ve
  -- borçları birkaç kişiyle. İleride gerekirse `counterparty`
  -- sütunu bir FK'ye dönüştürülebilir, tersi zor olurdu.
  counterparty    text not null check (length(trim(counterparty)) between 1 and 80),

  principal_kurus bigint not null check (principal_kurus > 0),

  opened_on       date not null,
  -- Son ödeme tarihi. NULL = vadesiz.
  due_on          date,

  note            text check (note is null or length(note) <= 500),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint due_after_opened check (due_on is null or due_on >= opened_on)
);

create index debts_user_idx
  on public.debts (user_id, direction, opened_on desc);

-- Vade uyarısı bu indeksten okur.
create index debts_due_idx
  on public.debts (user_id, due_on)
  where due_on is not null;

-- ───────────────────────── debt_payments ────────────────────────────
create table public.debt_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,

  -- Borç silinirse ödemeleri de gider: sahipsiz ödeme anlamsızdır.
  debt_id        uuid not null references public.debts (id) on delete cascade,

  amount_kurus   bigint not null check (amount_kurus > 0),
  date           date not null,
  note           text check (note is null or length(note) <= 300),

  -- ★ Ödeme gerçek para hareketi de yarattıysa o işleme bağlanır.
  -- NULL olabilir: "elden verdim, hesabıma yansımadı" durumu.
  --
  -- `on delete set null`: işlem silinince ödeme kaydı KAYBOLMAZ,
  -- yalnızca bağı kopar. Tersi (cascade) olsaydı bir işlemi silmek
  -- borç geçmişini de sessizce siler ve kalan borç yanlış artardı.
  transaction_id uuid references public.transactions (id) on delete set null,

  created_at     timestamptz not null default now()
);

create index debt_payments_debt_idx
  on public.debt_payments (debt_id, date);

-- ─────────────────────────────── RLS ────────────────────────────────
alter table public.debts         enable row level security;
alter table public.debt_payments enable row level security;

create policy debts_select on public.debts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy debts_insert on public.debts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy debts_update on public.debts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy debts_delete on public.debts
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy debt_payments_select on public.debt_payments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy debt_payments_insert on public.debt_payments
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy debt_payments_update on public.debt_payments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy debt_payments_delete on public.debt_payments
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ★ Sahiplik sertleştirmesi — 0002 / 0006 / 0007 ile aynı desen.
-- RLS `user_id`'yi korur ama `debt_id` başka kullanıcının borcunu
-- gösterebilir; composite FK bunu imkânsız kılar.
alter table public.debts
  add constraint debts_id_user_uk unique (id, user_id);

alter table public.debt_payments
  add constraint debt_payments_debt_same_owner
    foreign key (debt_id, user_id)
    references public.debts (id, user_id) on delete cascade,
  add constraint debt_payments_transaction_same_owner
    foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete set null;

-- `transactions` üzerinde (id, user_id) benzersizliği gerekiyor ki
-- yukarıdaki composite FK ona referans verebilsin.
alter table public.transactions
  add constraint transactions_id_user_uk unique (id, user_id);

-- ───────────────────────────── Trigger'lar ──────────────────────────
create trigger debts_stamp_user_id
  before insert on public.debts
  for each row execute function public.stamp_user_id();

create trigger debts_touch_updated_at
  before update on public.debts
  for each row execute function public.touch_updated_at();

create trigger debt_payments_stamp_user_id
  before insert on public.debt_payments
  for each row execute function public.stamp_user_id();

-- ★ Ödeme tarihi borcun açılışından önce olamaz.
-- `check` kısıtı yapamaz (başka tabloya bakıyor), trigger yapar.
create or replace function public.check_payment_date()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  debt_opened date;
begin
  select opened_on into debt_opened
    from public.debts
   where id = new.debt_id;

  if new.date < debt_opened then
    raise exception
      'Ödeme tarihi borcun açılış tarihinden önce olamaz (ödeme: %, açılış: %)',
      new.date, debt_opened;
  end if;

  return new;
end; $$;

create trigger debt_payments_check_date
  before insert or update on public.debt_payments
  for each row execute function public.check_payment_date();

-- ═══════════════════════════════════════════════════════════════════
-- Borç kalanları görünümü
--
-- Anapara + ödenen + kalan tek satırda. `closed` sütunu yerine
-- `remaining_kurus <= 0` bakılır — tek doğruluk kaynağı ödemelerdir.
--
-- LEFT JOIN: hiç ödeme yapılmamış borç da görünmeli (0 ödenmiş
-- olarak). INNER JOIN olsaydı yeni açılan borç listede hiç
-- görünmezdi.
-- ═══════════════════════════════════════════════════════════════════
create view public.debt_balances
with (security_invoker = true) as
select
  d.id            as debt_id,
  d.user_id,
  d.direction,
  d.principal_kurus,
  coalesce(p.paid_kurus, 0)                        as paid_kurus,
  d.principal_kurus - coalesce(p.paid_kurus, 0)    as remaining_kurus,
  coalesce(p.payment_count, 0)                     as payment_count,
  p.last_payment_date
from public.debts d
left join lateral (
  select
    sum(dp.amount_kurus) as paid_kurus,
    count(*)             as payment_count,
    max(dp.date)         as last_payment_date
  from public.debt_payments dp
  where dp.debt_id = d.id
    and dp.user_id = d.user_id
) p on true;
