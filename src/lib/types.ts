export type FillTrigger =
  | { type: "nanofill/fill" }
  | { type: "nanofill/fill-all" };

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

