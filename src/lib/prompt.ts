import type { FieldDescriptor, FormContext } from "./context";
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

const PERSONA_AUTOCOMPLETE = new Set([
  "name", "given-name", "additional-name", "family-name", "honorific-prefix", "honorific-suffix",
  "nickname", "username", "email", "tel", "tel-national", "tel-local",
  "organization", "street-address", "address-line1", "address-line2", "address-line3",
  "address-level1", "address-level2", "address-level3", "address-level4",
  "country", "country-name", "postal-code", "bday", "bday-day", "bday-month", "bday-year",
  "sex", "url", "photo",
]);

function isPersonaField(field: FieldDescriptor): boolean {
  if (!field.autocomplete) return false;
  return field.autocomplete.split(/\s+/).some((tok) => PERSONA_AUTOCOMPLETE.has(tok));
}

function sanitizeSiblings(focused: FieldDescriptor, siblings: FieldDescriptor[]): FieldDescriptor[] {
  if (isPersonaField(focused)) return siblings;
  return siblings.map((s) => {
    if (!s.currentValue) return s;
    return { ...s, currentValue: undefined };
  });
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
    otherFields: sanitizeSiblings(context.focused, context.siblings),
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
