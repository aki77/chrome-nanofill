import type { FillResult, FillTrigger } from "../lib/types";

const MENU_ID = "nanofill-fill";

function createMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Fill with Nanofill",
      contexts: ["editable"],
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  const options: chrome.tabs.MessageSendOptions = {};
  if (typeof info.frameId === "number") {
    options.frameId = info.frameId;
  }

  chrome.tabs
    .sendMessage(tab.id, { type: "nanofill/fill" } satisfies FillTrigger, options)
    .then((response: FillResult | undefined) => {
      if (!response?.ok) {
        console.warn("[Nanofill] Fill failed:", response);
      }
    })
    .catch((err: unknown) => {
      console.warn("[Nanofill] Could not reach content script:", err);
    });
});
