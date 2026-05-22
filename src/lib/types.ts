export type FillTrigger =
  | { type: "nanofill/fill" }
  | { type: "nanofill/fill-all" };

export type LlmRequest =
  | { type: "nanofill/llm/generate-value"; userPrompt: string; outputLanguage: string }
  | { type: "nanofill/llm/generate-persona"; userPrompt: string; outputLanguage: string }
  | { type: "nanofill/llm/availability" };

export type LlmAvailabilityStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export type LlmResponse<T = string> =
  | { ok: true; value: T }
  | { ok: false; reason: "api-unavailable" | "model-unavailable" | "generation-failed"; detail?: string };

export type FillResult =
  | { ok: true; value: string }
  | { ok: true; mode: "all"; filled: number; skipped: number; failed: number }
  | { ok: false; reason: FillFailureReason; detail?: string };

export type FillFailureReason =
  | "no-focus"
  | "unsupported-element"
  | "api-unavailable"
  | "model-unavailable"
  | "downloading"
  | "generation-failed";

