-- ═══════════════════════════════════════════════════════════════════
-- 0002 — Row Level Security
--
-- ÜÇ KURAL (her politikada, istisnasız):
--
-- 1. `(select auth.uid())` ALT SORGU FORMU. Çıplak `auth.uid()`
--    her satır için yeniden çalıştırılır; alt sorgu formu Postgres
--    tarafından bir kez hesaplanıp önbelleğe alınır. Binlerce satırlık
--    bir listede fark ölçülebilir.
--
-- 2. `to authenticated`. Rol belirtilmezse politika `anon` rolü için
--    de değerlendirilir ve gereksiz iş yapılır.
--
-- 3. INSERT/UPDATE'te `with check`. `using` yalnızca OKUNAN satırı
--    filtreler; YAZILAN satırı `with check` doğrular. Unutulursa
--    kullanıcı başkasının user_id'siyle satır yazabilir.
-- ═══════════════════════════════════════════════════════════════════

alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;

-- ──────────────────────────── accounts ──────────────────────────────
create policy accounts_select on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy accounts_insert on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy accounts_update on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy accounts_delete on public.accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ─────────────────────────── categories ─────────────────────────────
create policy categories_select on public.categories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy categories_insert on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy categories_update on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy categories_delete on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ─────────────────────────── transactions ───────────────────────────
create policy transactions_select on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy transactions_insert on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy transactions_update on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy transactions_delete on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- ★ EK SERTLEŞTİRME — FK'lerin de kullanıcıya ait olması
--
-- RLS `user_id` sütununu korur, ama `transactions.account_id` BAŞKA
-- kullanıcının hesabını gösterebilir: istemci UUID uydurabilir ve
-- normal FK bunu engellemez. Satır kendi user_id'siyle yazılır, RLS
-- memnun kalır, ama para başkasının hesabına işlenir.
--
-- Çözüm: (id, user_id) composite unique + composite FK. Artık
-- referans verilen hesabın user_id'si de eşleşmek ZORUNDA.
-- ═══════════════════════════════════════════════════════════════════

alter table public.accounts
  add constraint accounts_id_user_uk unique (id, user_id);
alter table public.categories
  add constraint categories_id_user_uk unique (id, user_id);

alter table public.transactions
  add constraint transactions_account_same_owner
    foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  add constraint transactions_counter_same_owner
    foreign key (counter_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  add constraint transactions_category_same_owner
    foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null;
