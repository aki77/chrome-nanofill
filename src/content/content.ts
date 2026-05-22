import {
  buildContext,
  buildPlannerContext,
  detectLanguage,
  getFocusedFillable,
  toFillable,
  type FillableElement,
} from "../lib/context";
import { getCachedEntry, hashContent, setSummary } from "../lib/cache";
import { extractPageText } from "../lib/extract";
import {
  generateValue,
  generateValueWithSession,
  generatePersona,
  isPromptApiSupported,
  probeAvailability,
  SYSTEM_PROMPT,
} from "../lib/prompt";
import type { Persona } from "../lib/persona";
import { summarizePageText } from "../lib/summarize";
import type { FillResult, FillTrigger } from "../lib/types";
import { showFeedback, type FeedbackHandle } from "./feedback";

const CONCURRENCY = 2;

async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

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

type FillOneOptions = {
  pageSummary: string | null;
  trackDownload: boolean;
  persona?: Persona;
  session?: LanguageModel;
};

async function fillOne(
  target: FillableElement,
  feedback: FeedbackHandle,
  opts: FillOneOptions,
): Promise<{ ok: true; value: string } | { ok: false; detail?: string }> {
  const context = buildContext(target, {
    pageSummary: opts.pageSummary ?? undefined,
    persona: opts.persona,
  });
  try {
    const value = opts.session
      ? await generateValueWithSession(opts.session, context)
      : await generateValue({
          context,
          onDownloadProgress: opts.trackDownload
            ? (loaded) => feedback.setDownloadProgress(loaded)
            : undefined,
        });
    if (!target.isConnected) return { ok: false, detail: "disconnected" };
    setValue(target, value);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
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
    const result = await fillOne(target, feedback, {
      pageSummary,
      trackDownload: availability.status !== "available",
    });
    if (result.ok) {
      feedback.succeed();
      return { ok: true, value: result.value };
    }
    feedback.fail();
    return {
      ok: false,
      reason: "generation-failed",
      detail: result.detail,
    };
  } catch (err) {
    feedback.fail();
    return {
      ok: false,
      reason: "generation-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function collectFillableFields(form: HTMLFormElement): FillableElement[] {
  const out: FillableElement[] = [];
  for (const el of Array.from(form.elements)) {
    const f = toFillable(el);
    if (!f) continue;
    if (f.disabled) continue;
    if (
      "readOnly" in f &&
      (f as HTMLInputElement | HTMLTextAreaElement).readOnly
    )
      continue;
    out.push(f);
  }
  return out;
}

function isEmpty(el: FillableElement): boolean {
  if (el instanceof HTMLSelectElement) {
    if (el.multiple) return el.selectedOptions.length === 0;
    if (el.selectedIndex < 0) return true;
    return el.value.trim() === "";
  }
  return el.value === "";
}

async function handleFillAll(): Promise<FillResult> {
  if (!isPromptApiSupported()) {
    return { ok: false, reason: "api-unavailable" };
  }

  const target = getTargetElement();
  lastRightClickedTarget = null;
  if (!target) return { ok: false, reason: "no-focus" };

  const form = target.form ?? target.closest("form");
  if (!form) return { ok: false, reason: "no-focus" };

  const availability = await probeAvailability();
  if (availability.status === "unavailable") {
    return { ok: false, reason: "model-unavailable" };
  }

  const all = collectFillableFields(form);
  const fields = all.filter(isEmpty);
  const skipped = all.length - fields.length;
  if (fields.length === 0) {
    return { ok: true, mode: "all", filled: 0, skipped, failed: 0 };
  }

  const planningFeedback = showFeedback(target);
  planningFeedback.setStatus("✨ Analyzing page…");

  const [pageSummary, parent] = await Promise.all([
    preparePageSummary(target).catch(() => null),
    LanguageModel.create({
      initialPrompts: [{ role: "system" as const, content: SYSTEM_PROMPT }],
    }),
  ]);

  let filled = 0;
  let failed = 0;

  try {
    planningFeedback.setStatus("✨ Planning form persona…");
    const plannerInput = buildPlannerContext(form, {
      pageSummary: pageSummary ?? undefined,
    });
    const persona = await generatePersona({ input: plannerInput }).catch(
      () => undefined,
    );
    planningFeedback.dismiss();

    const results = await runPool(fields, CONCURRENCY, async (field) => {
      const child = await parent.clone();
      const fb = showFeedback(field, { multi: true });
      fb.setStatus("✨ Filling…");

      try {
        const result = await fillOne(field, fb, {
          pageSummary,
          trackDownload: false,
          persona,
          session: child,
        });
        if (result.ok) {
          fb.succeed();
        } else {
          fb.fail();
        }
        return result;
      } finally {
        child.destroy();
      }
    });

    for (const result of results) {
      if (result.ok) {
        filled++;
      } else {
        failed++;
      }
    }
  } finally {
    parent.destroy();
  }

  return { ok: true, mode: "all", filled, skipped, failed };
}

try {
  chrome.runtime.onMessage.addListener(
    (message: FillTrigger, _sender, sendResponse) => {
      if (message?.type === "nanofill/fill") {
        (async () => sendResponse(await handleFill()))();
        return true;
      }
      if (message?.type === "nanofill/fill-all") {
        (async () => sendResponse(await handleFillAll()))();
        return true;
      }
      return false;
    },
  );
} catch {
  // Extension context invalidated (e.g. after extension reload) — safe to ignore
}

trackFocus();
trackContextMenu();
