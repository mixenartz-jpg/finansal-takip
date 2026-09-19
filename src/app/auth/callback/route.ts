import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";

/** E-posta doğrulama bağlantısının döndüğü yer. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  // Açık yönlendirme olmaması için yalnızca site içi göreli yollara izin ver.
  const requestedNext = searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";

  // nextUrl.origin proxy arkasında dahili adresi verebilir; kendi kökümüzü kullan.
  const origin = getSiteUrl();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/giris?error=auth`);
}
