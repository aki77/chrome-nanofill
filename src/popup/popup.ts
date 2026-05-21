import type {
  AvailabilityProbe,
  AvailabilityResult,
  FillFailureReason,
  FillResult,
  FillTrigger,
} from "../lib/types";

const statusDot = document.getElementById("status-dot") as HTMLDivElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const fillBtn = document.getElementById("fill-btn") as HTMLButtonElement;
const resultEl = document.getElementById("result") as HTMLParagraphElement;

function setStatus(
  level: "available" | "downloading" | "unavailable" | "unknown",
  text: string,
): void {
  statusDot.className = `dot dot--${level}`;
  statusText.textContent = text;
}

function setResult(
  message: string,
  level: "success" | "error" | "neutral" = "neutral",
): void {
  resultEl.textContent = message;
  resultEl.className =
    level === "success"
      ? "result result--success"
      : level === "error"
        ? "result result--error"
        : "result";
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

async function sendToContent<T>(
  tabId: number,
  message: AvailabilityProbe | FillTrigger,
): Promise<T | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    return null;
  }
}

async function broadcastFill(tabId: number): Promise<FillResult | null> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "nanofill/fill",
    } satisfies FillTrigger)) as FillResult | undefined;
    return response ?? null;
  } catch {
    return null;
  }
}

async function refreshAvailability(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("unavailable", "No active tab.");
    fillBtn.disabled = true;
    return;
  }

  const response = await sendToContent<AvailabilityResult>(tab.id, {
    type: "nanofill/availability",
  });

  if (!response) {
    setStatus(
      "unavailable",
      "Not reachable on this page (try a regular http(s) page).",
    );
    fillBtn.disabled = true;
    return;
  }

  if (!response.ok) {
    setStatus("unavailable", "Prompt API not available in this browser.");
    fillBtn.disabled = true;
    return;
  }

  switch (response.status) {
    case "available":
      setStatus("available", "Gemini Nano is ready.");
      fillBtn.disabled = false;
      break;
    case "downloadable":
      setStatus("downloading", "Model will download on first use.");
      fillBtn.disabled = false;
      break;
    case "downloading":
      setStatus("downloading", "Model is downloading…");
      fillBtn.disabled = false;
      break;
    case "unavailable":
      setStatus("unavailable", "Model unavailable on this device.");
      fillBtn.disabled = true;
      break;
  }
}

const FAILURE_MESSAGES: Record<FillFailureReason, string> = {
  "no-focus":
    "Focus a text input, textarea, or select first, then click again.",
  "unsupported-element": "Focused element type is not supported.",
  "api-unavailable": "Prompt API not available in this browser.",
  "model-unavailable": "Gemini Nano model is not available on this device.",
  downloading: "Model is still downloading. Try again shortly.",
  "generation-failed": "Generation failed.",
};

fillBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setResult("No active tab.", "error");
    return;
  }
  fillBtn.disabled = true;
  setResult("Generating…");
  const response = await broadcastFill(tab.id);
  fillBtn.disabled = false;

  if (!response) {
    setResult(FAILURE_MESSAGES["no-focus"], "error");
    return;
  }

  if (response.ok) {
    setResult(`Filled: ${response.value}`, "success");
    return;
  }

  const detail =
    response.reason === "generation-failed" && response.detail
      ? `Generation failed: ${response.detail}`
      : FAILURE_MESSAGES[response.reason];
  setResult(detail, "error");
});

refreshAvailability();
