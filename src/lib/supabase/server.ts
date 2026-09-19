import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Sunucu tarafı Supabase istemcisi (Server Component / Route Handler). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component'ten çağrıldığında cookie yazılamaz.
          // Oturum tazeleme middleware'de yapıldığı için bu güvenle
          // yok sayılabilir.
        }
      },
    },
  });
}
