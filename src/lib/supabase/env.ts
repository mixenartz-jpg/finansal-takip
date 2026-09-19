/**
 * Supabase ortam değişkenleri.
 *
 * Yalnızca istemciye açılabilir anahtarlar buradadır. `service_role`
 * anahtarı bu dosyaya ASLA girmez — RLS'i tamamen bypass eder ve bir
 * `NEXT_PUBLIC_` öneki uzaklıktadır.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} tanımlı değil. .env.local dosyasını .env.example'a göre doldurun.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
