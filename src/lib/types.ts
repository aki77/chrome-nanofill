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

export type AvailabilityProbe = { type: "nanofill/availability" };

export type AvailabilityResult =
  | { ok: true; status: AvailabilityStatus; downloadProgress?: number }
  | { ok: false; reason: "no-content-script" | "api-unavailable" };

export type AvailabilityStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";
