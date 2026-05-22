import type { FillableElement } from "../lib/context";

const SHEET_DOCS = new WeakSet<Document>();
const BADGE_CLASS = "nanofill-feedback-badge";
const TARGET_CLASS = "nanofill-feedback-target";
const TARGET_FAIL_CLASS = "nanofill-feedback-target--fail";

const CSS_TEXT = `
@keyframes nanofill-pulse {
  0%, 100% { outline-color: rgba(99,102,241,0.35); }
  50%      { outline-color: rgba(99,102,241,1); }
}
@keyframes nanofill-pulse-fail {
  0%, 100% { outline-color: rgba(239,68,68,0.4); }
  50%      { outline-color: rgba(239,68,68,1); }
}
.${TARGET_CLASS} {
  outline: 2px solid rgba(99,102,241,0.8) !important;
  outline-offset: 2px !important;
  animation: nanofill-pulse 1.2s ease-in-out infinite !important;
}
.${TARGET_CLASS}.${TARGET_FAIL_CLASS} {
  outline-color: rgba(239,68,68,1) !important;
  animation: nanofill-pulse-fail 0.6s ease-in-out infinite !important;
}
`;

function ensureStyleSheet(doc: Document): void {
  if (SHEET_DOCS.has(doc)) return;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS_TEXT);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    const style = doc.createElement("style");
    style.textContent = CSS_TEXT;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  SHEET_DOCS.add(doc);
}

export type FeedbackHandle = {
  setStatus(text: string): void;
  setDownloadProgress(loaded: number): void;
  succeed(): void;
  fail(): void;
  dismiss(): void;
};

let activeHandle: FeedbackHandle | null = null;

export function showFeedback(
  target: FillableElement,
  opts?: { multi?: boolean },
): FeedbackHandle {
  if (!opts?.multi) activeHandle?.dismiss();

  const doc = target.ownerDocument;
  ensureStyleSheet(doc);

  const badge = doc.createElement("div");
  badge.className = BADGE_CLASS;
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");
  badge.setAttribute("aria-atomic", "true");
  badge.textContent = "";
  Object.assign(badge.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    font: "12px/1.4 system-ui, -apple-system, sans-serif",
    color: "#fff",
    background: "rgba(79,70,229,0.95)",
    padding: "3px 8px",
    borderRadius: "10px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    transition: "opacity 0.2s, background 0.2s",
    opacity: "1",
  });

  target.classList.add(TARGET_CLASS);
  doc.body.appendChild(badge);

  let rafId = 0;

  const position = () => {
    if (!target.isConnected) {
      handle.dismiss();
      return;
    }
    const r = target.getBoundingClientRect();
    badge.style.top = `${Math.max(0, r.top - 4)}px`;
    badge.style.left = `${Math.max(0, r.right - badge.offsetWidth - 4)}px`;
    rafId = requestAnimationFrame(position);
  };
  rafId = requestAnimationFrame(position);

  let dismissed = false;
  let failing = false;
  let dismissTimer = 0;

  const cleanup = () => {
    if (dismissed) return;
    dismissed = true;
    cancelAnimationFrame(rafId);
    clearTimeout(dismissTimer);
    badge.remove();
    target.classList.remove(TARGET_CLASS, TARGET_FAIL_CLASS);
    if (activeHandle === handle) activeHandle = null;
  };

  const handle: FeedbackHandle = {
    setStatus(text: string) {
      if (!failing) badge.textContent = text;
    },
    setDownloadProgress(loaded: number) {
      const pct = Math.round(loaded * 100);
      handle.setStatus(`⬇ Downloading model ${pct}%`);
    },
    succeed: cleanup,
    fail() {
      if (dismissed) return;
      failing = true;
      badge.textContent = "⚠️ Failed";
      badge.style.background = "rgba(220,38,38,0.95)";
      target.classList.add(TARGET_FAIL_CLASS);
      dismissTimer = window.setTimeout(cleanup, 1500);
    },
    dismiss: cleanup,
  };

  if (!opts?.multi) activeHandle = handle;
  return handle;
}
