import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Giriş yapılmamışken erişilebilen yollar. */
const PUBLIC_PATHS = ["/giris", "/auth"];

/**
 * Oturumu tazeler ve korumalı yolları kapıda tutar.
 *
 * İKİ KURAL — bunlara uyulmazsa kullanıcı rastgele oturumdan düşer:
 *
 * 1. `createServerClient` ile `getClaims()` arasına HİÇBİR kod
 *    girmemeli. Cookie işleme sıraya duyarlıdır.
 *
 * 2. `supabaseResponse` nesnesi olduğu gibi döndürülmeli. Yeni bir
 *    `NextResponse` üretiliyorsa cookie'ler mutlaka kopyalanmalı.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // createServerClient ile bu çağrı arasına kod eklemeyin.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    return NextResponse.redirect(url);
  }

  // Giriş yapmış kullanıcı giriş sayfasında durmasın.
  if (user && pathname.startsWith("/giris")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
