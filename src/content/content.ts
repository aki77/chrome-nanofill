import {
  buildContext,
  getFocusedFillable,
  toFillable,
  type FillableElement,
} from "../lib/context";
import {
  generateValue,
  isPromptApiSupported,
  probeAvailability,
} from "../lib/prompt";
import type { FillResult, FillTrigger } from "../lib/types";
import { showFeedback } from "./feedback";

let lastFocused: FillableElement | null = null;
let lastRightClickedTarget: FillableElement | null = null;

function trackFocus(): void {
  const update = () => {
    const candidate = getFocusedFillable();
    if (candidate) lastFocused = candidate;
  };
  document.addEventListener("focusin", update, true);
  document.addEventListener("pointerdown", update, true);
  update();
}

function trackContextMenu(): void {
  document.addEventListener(
    "contextmenu",
    (event) => {
      lastRightClickedTarget = toFillable(event.target as Element | null);
    },
    true,
  );
}

function getTargetElement(): FillableElement | null {
  if (lastRightClickedTarget?.isConnected) return lastRightClickedTarget;
  const current = getFocusedFillable();
  if (current) return current;
  if (lastFocused?.isConnected) return lastFocused;
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
  lastRightClickedTarget = null;
  if (!target) return { ok: false, reason: "no-focus" };

  const availability = await probeAvailability();
  if (availability.status === "unavailable") {
    return { ok: false, reason: "model-unavailable" };
  }

  const feedback = showFeedback(target);
  try {
    const context = buildContext(target);
    const value = await generateValue({
      context,
      onDownloadProgress:
        availability.status === "available"
          ? undefined
          : (loaded) => feedback.setDownloadProgress(loaded),
    });
    if (!target.isConnected) {
      feedback.fail();
      return { ok: false, reason: "no-focus" };
    }
    setValue(target, value);
    feedback.succeed();
    return { ok: true, value };
  } catch (err) {
    feedback.fail();
    return {
      ok: false,
      reason: "generation-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

try {
  chrome.runtime.onMessage.addListener(
    (message: FillTrigger, _sender, sendResponse) => {
      if (message?.type !== "nanofill/fill") return false;
      (async () => sendResponse(await handleFill()))();
      return true;
    },
  );
} catch {
  // Extension context invalidated (e.g. after extension reload) — safe to ignore
}

trackFocus();
trackContextMenu();
