import type { FillResult, FillTrigger } from "../lib/types";

const MENU_FILL = "nanofill-fill";
const MENU_FILL_ALL = "nanofill-fill-all";

function createMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_FILL,
      title: "Fill with Nanofill",
      contexts: ["editable"],
    });
    chrome.contextMenus.create({
      id: MENU_FILL_ALL,
      title: "Fill entire form with Nanofill",
      contexts: ["editable"],
    });
  });
}

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
    reasons: ["WORKERS" as chrome.offscreen.Reason],
    justification: "Host the long-lived LanguageModel session shared across tabs.",
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createMenu();
  void ensureOffscreen();
});
chrome.runtime.onStartup.addListener(() => {
  createMenu();
  void ensureOffscreen();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  let trigger: FillTrigger | null = null;
  if (info.menuItemId === MENU_FILL) trigger = { type: "nanofill/fill" };
  if (info.menuItemId === MENU_FILL_ALL) trigger = { type: "nanofill/fill-all" };
  if (!trigger) return;

  const options: chrome.tabs.MessageSendOptions = {};
  if (typeof info.frameId === "number") {
    options.frameId = info.frameId;
  }

  void ensureOffscreen().then(() => {
    chrome.tabs
      .sendMessage(tab.id!, trigger!, options)
      .then((response: FillResult | undefined) => {
        if (!response?.ok) {
          console.warn("[Nanofill] Fill failed:", response);
        }
      })
      .catch((err: unknown) => {
        console.warn("[Nanofill] Could not reach content script:", err);
      });
  });
});
