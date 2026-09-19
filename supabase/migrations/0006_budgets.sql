-- ═══════════════════════════════════════════════════════════════════
-- 0006 — Bütçeler (Faz 2)
--
-- Aylık, kategori başına harcama limiti.
--
-- ── İKİ TEMEL KARAR ──
--
-- 1. `month` bir DATE'tir ve DAİMA ayın 1'idir (check ile zorlanır).
--    text 'YYYY-MM' DEĞİL: date olunca aralık sorguları, sıralama ve
--    ay aritmetiği Postgres'in kendi araçlarıyla çalışır. Metin
--    olsaydı "2026-9" ile "2026-09" ayrı satırlar olurdu ve
--    sıralama '2026-10' < '2026-9' derdi.
--
-- 2. BÜTÇE BİR HEDEFTİR, YASAK DEĞİL. Şemada harcamayı engelleyen
--    hiçbir kısıt yoktur; limit aşılabilir ve aşıldığı görünür.
--    İşlem kaydını engellemek, gerçekten yapılmış bir harcamayı
--    kayıt dışı bırakır ve tüm bakiyeleri yalancı yapardı.
-- ═══════════════════════════════════════════════════════════════════

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Kategori silinirse bütçesi de gider: kategorisiz bir limit
  -- anlamsızdır. (İşlemlerdeki `set null` ile farkı kasıtlı —
  -- orada geçmiş bir olgu korunur, burada bir hedef tanımı.)
  category_id  uuid not null references public.categories (id) on delete cascade,

  -- Daima ayın 1'i. Uygulama `startOfMonth()` ile normalleştirir,
  -- bu kısıt da veritabanı tarafında garantiler.
  month        date not null check (extract(day from month) = 1),

  limit_kurus  bigint not null check (limit_kurus > 0),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Bir kategoriye bir ayda tek limit. Çakışan iki limit hangisinin
  -- geçerli olduğu sorusunu doğurur ve cevabı yoktur.
  unique (user_id, category_id, month)
);

-- Bütçe sayfası ve panel uyarısı hep (kullanıcı, ay) ile sorgular.
create index budgets_user_month_idx
  on public.budgets (user_id, month desc);

-- ─────────────────────────────── RLS ────────────────────────────────
-- 0002_rls.sql'deki üç kuralın aynısı: `(select auth.uid())` alt
-- sorgu formu, `to authenticated`, INSERT/UPDATE'te `with check`.
alter table public.budgets enable row level security;

create policy budgets_select on public.budgets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy budgets_insert on public.budgets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy budgets_update on public.budgets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy budgets_delete on public.budgets
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ★ Sahiplik sertleştirmesi — 0002'deki composite FK deseni.
-- RLS `user_id`'yi korur ama `category_id` başka kullanıcının
-- kategorisini gösterebilir; composite FK bunu imkânsız kılar.
alter table public.budgets
  add constraint budgets_category_same_owner
    foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete cascade;

-- ───────────────────────────── Trigger'lar ──────────────────────────
create trigger budgets_stamp_user_id
  before insert on public.budgets
  for each row execute function public.stamp_user_id();

create trigger budgets_touch_updated_at
  before update on public.budgets
  for each row execute function public.touch_updated_at();

-- ★ Bütçe YALNIZCA gider kategorisine konur.
--
-- `check` kısıtı yapamaz (başka tabloya bakıyor), trigger yapar.
-- Gelir kategorisine limit koymak anlamsızdır: "Maaş bütçem 50.000"
-- cümlesi bir hedef değil, bir dilektir ve aşım uyarısı ters
-- anlam taşır (çok maaş almak kötü değildir).
create or replace function public.check_budget_category_kind()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  cat_kind public.category_kind;
begin
  select kind into cat_kind
    from public.categories
   where id = new.category_id;

  if cat_kind <> 'expense' then
    raise exception 'Bütçe yalnızca gider kategorisine konabilir (kategori: %)', cat_kind;
  end if;

  return new;
end; $$;

create trigger budgets_check_category_kind
  before insert or update on public.budgets
  for each row execute function public.check_budget_category_kind();

-- ═══════════════════════════════════════════════════════════════════
-- Bütçe ilerlemesi görünümü
--
-- Limit + o ayın gerçek harcaması tek satırda. İstemcinin iki ayrı
-- sorgu çekip elde birleştirmesine gerek kalmaz.
--
-- LEFT JOIN yönü önemli: limiti olan ama hiç harcama yapılmamış
-- kategori de görünmeli (0 harcanmış olarak). INNER JOIN olsaydı
-- "Giyim bütçem var ama bu ay hiç almadım" satırı kaybolurdu ve
-- kullanıcı bütçesini unuturdu.
-- ═══════════════════════════════════════════════════════════════════
create view public.budget_progress
with (security_invoker = true) as
select
  b.id          as budget_id,
  b.user_id,
  b.category_id,
  b.month,
  b.limit_kurus,
  coalesce(spent.total_kurus, 0)                      as spent_kurus,
  b.limit_kurus - coalesce(spent.total_kurus, 0)      as remaining_kurus
from public.budgets b
left join lateral (
  select sum(t.amount_kurus) as total_kurus
  from public.transactions t
  where t.user_id = b.user_id
    and t.category_id = b.category_id
    -- Yalnızca GİDER. Transfer ve gelir bütçeyi tüketmez; transferin
    -- zaten kategorisi olamaz (transfer_shape), gelir ise ayrı küme.
    and t.kind = 'expense'
    -- Ay aralığı: [ayın 1'i, sonraki ayın 1'i). `date` sütunu
    -- timezone'suz olduğu için kayma riski yok.
    and t.date >= b.month
    and t.date < (b.month + interval '1 month')::date
) spent on true;
