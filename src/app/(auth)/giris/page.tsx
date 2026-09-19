import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Giris — Hesap Takip" };

export default function GirisPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-[1.375rem]">Hesap Takip</h1>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Konuşarak işlem ekleyebildiğiniz kişisel finans takibi.
          </p>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-5">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
