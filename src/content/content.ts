import {
  buildContext,
  getFocusedFillable,
  type FillableElement,
} from "../lib/context";
import {
  generateValue,
  isPromptApiSupported,
  probeAvailability,
} from "../lib/prompt";
import type {
  AvailabilityProbe,
  AvailabilityResult,
  FillResult,
  FillTrigger,
} from "../lib/types";

let lastFocused: FillableElement | null = null;

function trackFocus(): void {
  const update = () => {
    const candidate = getFocusedFillable();
    if (candidate) lastFocused = candidate;
  };
  document.addEventListener("focusin", update, true);
  document.addEventListener("pointerdown", update, true);
  update();
}

function getTargetElement(): FillableElement | null {
  const current = getFocusedFillable();
  if (current) return current;
  if (lastFocused && lastFocused.isConnected) return lastFocused;
  return null;
}

function setValue(el: FillableElement, value: string): void {
  if (el instanceof HTMLSelectElement) {
    const match = Array.from(el.options).find(
      (o) => o.text.trim() === value.trim() || o.value === value,
    );
    el.value = match ? match.value : value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function handleFill(): Promise<FillResult> {
  if (!isPromptApiSupported()) {
    return { ok: false, reason: "api-unavailable" };
  }

  const target = getTargetElement();
  if (!target) return { ok: false, reason: "no-focus" };

  const availability = await probeAvailability();
  if (availability.status === "unavailable") {
    return { ok: false, reason: "model-unavailable" };
  }

  try {
    const context = buildContext(target);
    const value = await generateValue({ context });
    if (!target.isConnected) {
      return { ok: false, reason: "no-focus" };
    }
    setValue(target, value);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      reason: "generation-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleAvailability(): Promise<AvailabilityResult> {
  if (!isPromptApiSupported()) {
    return { ok: false, reason: "api-unavailable" };
  }
  const snapshot = await probeAvailability();
  return { ok: true, status: snapshot.status };
}

const isTopFrame = window.top === window;

function hasFillTarget(): boolean {
  return getTargetElement() !== null;
}

chrome.runtime.onMessage.addListener(
  (message: FillTrigger | AvailabilityProbe, _sender, sendResponse) => {
    if (message?.type === "nanofill/fill") {
      if (!hasFillTarget()) return false;
      (async () => sendResponse(await handleFill()))();
      return true;
    }
    if (message?.type === "nanofill/availability") {
      if (!isTopFrame) return false;
      (async () => sendResponse(await handleAvailability()))();
      return true;
    }
    return false;
  },
);

trackFocus();
