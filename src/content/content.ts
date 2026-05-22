import {
  buildContext,
  detectLanguage,
  getFocusedFillable,
  toFillable,
  type FillableElement,
} from "../lib/context";
import { getCachedEntry, hashContent, setSummary } from "../lib/cache";
import { extractPageText } from "../lib/extract";
import {
  generateValue,
  isPromptApiSupported,
  probeAvailability,
} from "../lib/prompt";
import { summarizePageText } from "../lib/summarize";
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

async function preparePageSummary(
  target: FillableElement,
): Promise<string | null> {
  const doc = target.ownerDocument;
  const { text } = extractPageText(doc);
  if (!text || text.length < 200) return null;

  const url = doc.defaultView?.location.href ?? location.href;
  const contentHash = await hashContent(text);
  const entry = await getCachedEntry(url);
  if (entry?.contentHash === contentHash) return entry.summary;

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 15_000);
  try {
    const summary = await summarizePageText(text, {
      language: detectLanguage(doc),
      signal: ctrl.signal,
    });
    if (summary) await setSummary(url, summary, contentHash);
    return summary;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    feedback.setStatus("✨ Analyzing page…");
    const pageSummary = await preparePageSummary(target).catch(() => null);

    feedback.setStatus("✨ Filling…");
    const context = buildContext(target, {
      pageSummary: pageSummary ?? undefined,
    });
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
