"use client";

import { useEffect, useState } from "react";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { supportMessage } from "./support";
import { DraftCard } from "./DraftCard";
import { createParser } from "@/features/parser";
import type { ParseResult } from "@/features/parser/types";
import { useCategories } from "@/features/categories/queries";
import { useAccounts } from "@/features/accounts/queries";
import { useCreateTransaction } from "@/features/transactions/queries";
import type { TransactionInput } from "@/features/transactions/types";
import { todayStr } from "@/lib/date/date";
import { Button } from "@/components/ui";

/**
 * Sesli giriş paneli.
 *
 * ── AKIŞ ──
 *
 *   dinle → transkript → ayrıştır → ONAY KARTI → kaydet
 *
 * Ayrıştırma otomatik, kayıt DEĞİL. Kullanıcı onay kartını görmeden
 * hiçbir şey veritabanına yazılmaz.
 *
 * ── PARSER TEK SEFER KURULUR ──
 *
 * `createParser()` her render'da çağrılsaydı zincir yeniden kurulur
 * ve ileride eklenecek LLM parser'ın durumu (bağlantı havuzu, önbellek)
 * her seferinde sıfırlanırdı.
 */
const parser = createParser();

type Phase = "idle" | "listening" | "review";

export function DictationSheet({ onClose }: { onClose: () => void }) {
  const speech = useSpeechRecognition();
  const categories = useCategories();
  const accounts = useAccounts();
  const createTransaction = useCreateTransaction();

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Transkript kesinleştiğinde ayrıştır.
  useEffect(() => {
    if (!speech.transcript || speech.state === "listening") return;
    if (phase === "review") return;

    let cancelled = false;
    const ctx = {
      categories: categories.data ?? [],
      accounts: accounts.data ?? [],
      today: todayStr(),
      defaultAccountId: accounts.data?.[0]?.id ?? null,
    };

    parser
      .parse(speech.transcript, ctx)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setPhase("review");
      })
      .catch(() => {
        if (cancelled) return;
        setParseError("Söylediğiniz anlaşılamadı. Tekrar deneyin veya elle ekleyin.");
        setPhase("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [speech.transcript, speech.state, phase, categories.data, accounts.data]);

  function handleStart() {
    setParseError(null);
    setResult(null);
    speech.reset();
    speech.start();
    setPhase("listening");
  }

  function handleSave(input: TransactionInput) {
    createTransaction.mutate(input, {
      onSuccess: () => {
        speech.reset();
        onClose();
      },
    });
  }

  function handleCancel() {
    speech.reset();
    setResult(null);
    setPhase("idle");
  }

  const unsupported = supportMessage(speech.support);

  // Desteklenmeyen tarayıcı: mikrofon hiç gösterilmez, kullanıcı
  // manuel forma yönlendirilir. Tıklandığında hiçbir şey yapmayan
  // bir düğme, olmayan düğmeden kötüdür.
  if (unsupported) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-[var(--ink-2)]">{unsupported}</p>
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      </div>
    );
  }

  if (phase === "review" && result) {
    return (
      <div className="p-4">
        <DraftCard
          result={result}
          transcript={speech.transcript}
          categories={categories.data ?? []}
          accounts={accounts.data ?? []}
          saving={createTransaction.isPending}
          onSave={handleSave}
          onCancel={handleCancel}
        />
        {createTransaction.error && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {createTransaction.error.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <MicButton
        listening={speech.state === "listening"}
        onClick={speech.state === "listening" ? speech.stop : handleStart}
      />

      <div className="min-h-[3rem] text-center">
        {speech.state === "listening" ? (
          <>
            <p className="text-sm font-medium text-[var(--ink)]">Dinliyorum…</p>
            <p className="text-sm text-[var(--ink-3)]">
              {speech.interim || "Örnek: “200 tl yemek aldım”"}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--ink-3)]">
            Mikrofona dokunup işlemi söyleyin.
            <br />
            Örnek: <span className="text-[var(--ink-2)]">“bugün 40 bin tl para geldi”</span>
          </p>
        )}
      </div>

      {(speech.error || parseError) && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {speech.error ?? parseError}
        </p>
      )}

      <Button variant="ghost" onClick={onClose}>
        Kapat
      </Button>
    </div>
  );
}

/**
 * Mikrofon düğmesi.
 *
 * Dinleme durumu HAREKETLE bildirilir (nabız), ama hareket tek
 * gösterge değildir: renk ve metin de değişir. Yalnızca animasyona
 * bağlı bir durum göstergesi, azaltılmış hareket tercihi açık olan
 * kullanıcıya hiçbir şey anlatmaz.
 */
function MicButton({ listening, onClick }: { listening: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? "Kaydı durdur" : "Sesli giriş başlat"}
      aria-pressed={listening}
      className={[
        "relative grid size-20 place-items-center rounded-full",
        "transition-colors duration-[var(--dur)] ease-[var(--ease)]",
        listening
          ? "bg-[var(--expense)] text-white"
          : "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]",
      ].join(" ")}
    >
      {listening && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-[var(--expense)] opacity-40 motion-reduce:hidden"
        />
      )}
      <MicIcon />
    </button>
  );
}

function MicIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="relative"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
