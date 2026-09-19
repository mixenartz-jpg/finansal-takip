/**
 * Web Speech API ambient tipleri.
 *
 * TypeScript'in `lib.dom.d.ts` dosyasında `SpeechRecognition` YOKTUR:
 * API hâlâ taslak durumda ve yalnızca Chromium tabanlı tarayıcılarda
 * (webkit önekiyle) uygulanmış. Bir npm paketi eklemek yerine
 * kullandığımız yüzeyi burada elle tanımlıyoruz — ihtiyacımız olan
 * sekiz alan için bağımlılık almaya değmez.
 */

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

/**
 * Hata kodları. `not-allowed` ve `no-speech` en sık görülenler:
 * ilki mikrofon izni reddedildiğinde, ikincisi kullanıcı konuşmadan
 * beklediğinde gelir. İkisi de kullanıcıya farklı mesaj gerektirir.
 */
type SpeechRecognitionErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported";

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;

  start(): void;
  stop(): void;
  abort(): void;

  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
