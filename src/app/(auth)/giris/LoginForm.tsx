"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/supabase/site-url";

type Mode = "signin" | "signup";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "sent" };

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({ kind: "loading" });

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` },
        });
        if (error) throw error;
        setStatus({ kind: "sent" });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      router.push("/");
      router.refresh();
    } catch (error) {
      setStatus({ kind: "error", message: translateAuthError(error) });
    }
  }

  if (status.kind === "sent") {
    return (
      <div>
        <p className="text-sm text-[var(--ink)]">
          <strong className="font-medium">{email}</strong> adresine bir doğrulama
          bağlantısı gönderildi.
        </p>
        <p className="mt-2 text-sm text-[var(--ink-3)]">
          Bağlantıya tıkladıktan sonra buradan giriş yapabilirsiniz.
        </p>
        <Button
          variant="ghost"
          className="mt-4 -ml-3"
          onClick={() => {
            setMode("signin");
            setStatus({ kind: "idle" });
          }}
        >
          Girişe dön
        </Button>
      </div>
    );
  }

  const loading = status.kind === "loading";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="E-posta" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={loading}
        />
      </Field>

      <Field
        label="Şifre"
        htmlFor="password"
        hint={mode === "signup" ? "En az 6 karakter." : undefined}
      >
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={6}
          disabled={loading}
        />
      </Field>

      {status.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {status.message}
        </p>
      )}

      <Button type="submit" variant="primary" loading={loading} full>
        {mode === "signin" ? "Giriş yap" : "Hesap oluştur"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setStatus({ kind: "idle" });
        }}
        /* `min-h-6` + dikey dolgu: yalnizca metin yuksekligi (20px)
           WCAG 2.2 (2.5.8) 24x24 alt sinirinin altinda kaliyordu. */
        className="min-h-6 rounded-[var(--r-sm)] py-0.5 text-[13px] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
      >
        {mode === "signin"
          ? "Hesabınız yok mu? Hesap oluşturun"
          : "Zaten hesabınız var mı? Giriş yapın"}
      </button>
    </form>
  );
}

/**
 * Supabase hatalarını Türkçeleştirir.
 *
 * Ham İngilizce mesaj ("Invalid login credentials") kullanıcıya
 * gösterilmemeli: hem dili yanlış hem de ne yapması gerektiğini
 * söylemiyor.
 */
function translateAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Invalid login credentials")) {
    return "E-posta veya şifre hatalı.";
  }
  if (message.includes("User already registered")) {
    return "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.";
  }
  if (message.includes("Password should be at least")) {
    return "Şifre en az 6 karakter olmalı.";
  }
  if (message.includes("Email not confirmed")) {
    return "E-posta adresiniz doğrulanmamış. Gelen kutunuzu kontrol edin.";
  }
  if (message.includes("Unable to validate email address")) {
    return "Geçerli bir e-posta adresi girin.";
  }
  if (message.includes("For security purposes")) {
    return "Çok sık denediniz. Bir dakika sonra tekrar deneyin.";
  }
  return "Giriş yapılamadı. Bağlantınızı kontrol edip tekrar deneyin.";
}
