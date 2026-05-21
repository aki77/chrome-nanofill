export type FillTrigger = { type: "nanofill/fill" };

export type FillResult =
  | { ok: true; value: string }
  | { ok: false; reason: FillFailureReason; detail?: string };

export type FillFailureReason =
  | "no-focus"
  | "unsupported-element"
  | "api-unavailable"
  | "model-unavailable"
  | "downloading"
  | "generation-failed";

