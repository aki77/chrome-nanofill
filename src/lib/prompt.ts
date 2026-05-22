import type { FormContext } from "./context";
import type { LlmRequest, LlmResponse, LlmAvailabilityStatus } from "./types";

export type AvailabilitySnapshot = {
  status: "available" | "downloadable" | "downloading" | "unavailable";
};

export function isPromptApiSupported(): boolean {
  return typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined";
}

export async function probeAvailability(): Promise<AvailabilitySnapshot> {
  if (!isPromptApiSupported()) return { status: "unavailable" };
  const response = await chrome.runtime.sendMessage({
    type: "nanofill/llm/availability",
  } satisfies LlmRequest) as LlmResponse<LlmAvailabilityStatus>;
  if (!response.ok) return { status: "unavailable" };
  return { status: response.value };
}

function buildUserPrompt(context: FormContext): string {
  return JSON.stringify({
    language: context.pageLanguage,
    page: {
      title: context.pageTitle,
      url: context.pageUrl,
      summary: context.pageSummary,
    },
    focused: context.focused,
    otherFields: context.siblings,
  });
}

export type GenerateOptions = {
  context: FormContext;
  signal?: AbortSignal;
};

export async function generateValue({ context }: GenerateOptions): Promise<string> {
  const userPrompt = buildUserPrompt(context);
  const response = await chrome.runtime.sendMessage({
    type: "nanofill/llm/generate-value",
    userPrompt,
    outputLanguage: context.pageLanguage,
  } satisfies LlmRequest) as LlmResponse<string>;

  if (!response.ok) {
    throw new Error(response.detail ?? response.reason);
  }
  return response.value;
}
