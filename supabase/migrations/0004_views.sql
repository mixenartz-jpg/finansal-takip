-- ═══════════════════════════════════════════════════════════════════
-- 0004 — Türetilmiş görünümler
--
-- `accounts.balance` SÜTUNU YOKTUR ve olmayacaktır. Bakiye her
-- okumada hareketlerden hesaplanır.
--
-- ── NEDEN MATERIALIZED VIEW DEĞİL ──
--
-- (a) Yenileme gecikmesi "200 TL harcadım ama bakiye değişmedi"
--     demektir; bir hesap uygulamasında bu kusur değil ARIZADIR.
-- (b) Materialized view RLS'e UYMAZ — tek güvenlik katmanımız o.
--
-- ── ÖLÇEK ──
--
-- Bir bireyin yıllık işlem sayısı ~2.000. Bu toplam
-- `transactions_account_idx` üzerinden milisaniyeler sürer. Ölçek
-- sorunu oluşursa (on binlerce satır) çözüm materialized view değil,
-- AYLIK SNAPSHOT tablosudur: ay sonu bakiyesi dondurulur, view
-- yalnızca son snapshot'tan bugüne olan hareketleri toplar. O gün
-- gelene kadar bu view değişmeden çalışır ve API'si aynı kalır.
--
-- `security_invoker = true` HER view'da: altındaki tabloların RLS'i
-- geçerli kalır. Olmasaydı view, tanımlayanın yetkisiyle çalışır ve
-- herkes herkesin bakiyesini görürdü.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────── hesap bakiyeleri ─────────────────────────
create view public.account_balances
with (security_invoker = true) as
select
  a.id      as account_id,
  a.user_id,
  a.opening_kurus,
  a.opening_kurus + coalesce(mv.delta, 0) as balance_kurus
from public.accounts a
left join lateral (
  select sum(
    case
      -- Bu hesaba GİREN para
      when t.kind = 'income'   and t.account_id = a.id         then  t.amount_kurus
      when t.kind = 'transfer' and t.counter_account_id = a.id then  t.amount_kurus
      -- Bu hesaptan ÇIKAN para
      when t.kind = 'expense'  and t.account_id = a.id         then -t.amount_kurus
      when t.kind = 'transfer' and t.account_id = a.id         then -t.amount_kurus
      else 0
    end
  ) as delta
  from public.transactions t
  where t.user_id = a.user_id
    and (t.account_id = a.id or t.counter_account_id = a.id)
) mv on true;

-- ──────────────────── aylık kategori toplamları ─────────────────────
-- Raporlar bunu okur; binlerce satırı tele koymak yerine toplam
-- sunucuda alınır.
--
-- TRANSFERLER DAHİL DEĞİL (kind filtresi): kendi hesapları arasında
-- para taşımak ne gelir ne giderdir. Dahil edilseydi her transfer
-- hem gelir hem gider olarak sayılır ve aylık özet iki kat şişerdi.
create view public.monthly_category_totals
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.date)::date as month,
  t.kind,
  t.category_id,
  sum(t.amount_kurus) as total_kurus,
  count(*)            as tx_count
from public.transactions t
where t.kind in ('income', 'expense')
group by t.user_id, date_trunc('month', t.date), t.kind, t.category_id;

-- NOT: `date_trunc('month', date)` burada TIMEZONE GÜVENLİDİR çünkü
-- `date` sütunu timezone'suzdur. `timestamptz` olsaydı
-- `date_trunc('month', ts AT TIME ZONE 'Europe/Istanbul')` yazmak
-- gerekirdi ve unutmak, ayın 1'i gece yapılan işlemleri önceki aya
-- atardı.

-- ───────────────────────── günlük toplamlar ─────────────────────────
-- Nakit akışı grafiği ve panel özeti için.
create view public.daily_totals
with (security_invoker = true) as
select
  t.user_id,
  t.date,
  sum(case when t.kind = 'income'  then t.amount_kurus else 0 end) as income_kurus,
  sum(case when t.kind = 'expense' then t.amount_kurus else 0 end) as expense_kurus
from public.transactions t
where t.kind in ('income', 'expense')
group by t.user_id, t.date;
