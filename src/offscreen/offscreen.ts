import { time } from "../lib/debug";
import type { LlmRequest, LlmResponse, LlmAvailabilityStatus } from "../lib/types";

const SYSTEM_PROMPT = `You are a helpful assistant that generates plausible-looking dummy values for web form fields during development and testing.

Rules:
- Produce ONE value for the focused field only.
- Match the field's apparent purpose using its label, placeholder, name, autocomplete, type, and surrounding fields.
- Respect type constraints (email → looks like an email; tel → digits/separators; date → YYYY-MM-DD; number → numeric).
- Honor maxLength when present.
- For <select>, pick exactly one of the provided option labels verbatim.
- The value MUST be in the language specified by "language" in the user message (auto-detected from the page).
- Use clearly fictitious data — no real personal information, real phone numbers, or real addresses.
- Output ONLY the value itself. No quotes, no explanation, no surrounding text.
- For <textarea>, generate naturally flowing prose:
  - If lengthHint is "short", output 1-2 sentences.
  - If lengthHint is "medium", output 2-4 sentences in a single paragraph.
  - If lengthHint is "long", output multiple short paragraphs separated by \\n\\n (single \\n inside a paragraph if needed).
- If maxLength is present on a textarea, the total character count MUST stay within it.
- For <input>, output a short value, not prose:
  - If the field's label/placeholder/name implies a single word or short noun phrase (e.g. "name", "title", "company", "product"), output a single word or short noun phrase with NO trailing punctuation.
  - Even when the field naturally takes a sentence-like value (e.g. a one-line headline or summary), output AT MOST one short sentence — never multiple sentences.
  - Never insert line breaks in <input> values.
- For <select>, ignore the textarea length rules.
- If "pageSummary" is provided in the user message, treat it as a high-level hint about what the page is about. Use it to choose plausible values, but do not echo it verbatim.
- If "otherFields" contain non-empty "currentValue"s:
  - NEVER copy, echo, paraphrase, or translate any sibling's currentValue into your output. Each field must be independently generated.
  - Only when the focused field has a persona-style autocomplete attribute (e.g. name, email, tel, organization, street-address) should you use sibling values as hints to maintain a consistent fictional identity (same nationality, same writing tone, etc.).`;

const RESPONSE_CONSTRAINT = {
  type: "object",
  required: ["value"],
  additionalProperties: false,
  properties: {
    value: { type: "string" },
  },
} as const;

const valueSessionCache = new Map<string, Promise<LanguageModel>>();

type LanguageModelCreateOptionsWithLanguage = LanguageModelCreateOptions & { outputLanguage?: string };

function ensureValueSession(outputLanguage: string): Promise<LanguageModel> {
  let p = valueSessionCache.get(outputLanguage);
  if (!p) {
    const opts: LanguageModelCreateOptionsWithLanguage = {
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      outputLanguage,
    };
    p = time(`LanguageModel.create (value/${outputLanguage})`, () =>
      LanguageModel.create(opts),
    ).catch((err) => {
      valueSessionCache.delete(outputLanguage);
      throw err;
    });
    valueSessionCache.set(outputLanguage, p);
  }
  return p;
}

async function handleGenerateValue(userPrompt: string, outputLanguage: string): Promise<LlmResponse<string>> {
  const parent = await ensureValueSession(outputLanguage);
  const child = await time("parent.clone (value)", () => parent.clone());
  try {
    const raw = await time("session.prompt (value)", () =>
      child.prompt(userPrompt, { responseConstraint: RESPONSE_CONSTRAINT }),
    );
    const parsed = JSON.parse(raw) as { value: unknown };
    if (typeof parsed.value !== "string") {
      return { ok: false, reason: "generation-failed", detail: "Model returned a non-string value." };
    }
    return { ok: true, value: parsed.value };
  } catch (err) {
    valueSessionCache.delete(outputLanguage);
    return { ok: false, reason: "generation-failed", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    child.destroy();
  }
}

async function handleAvailability(): Promise<LlmResponse<LlmAvailabilityStatus>> {
  if (typeof LanguageModel === "undefined") {
    return { ok: true, value: "unavailable" };
  }
  try {
    const status = await LanguageModel.availability();
    return { ok: true, value: status };
  } catch (err) {
    return { ok: false, reason: "api-unavailable", detail: err instanceof Error ? err.message : String(err) };
  }
}

chrome.runtime.onMessage.addListener(
  (message: LlmRequest, _sender, sendResponse) => {
    if (message?.type === "nanofill/llm/generate-value") {
      void handleGenerateValue(message.userPrompt, message.outputLanguage).then(sendResponse);
      return true;
    }
    if (message?.type === "nanofill/llm/availability") {
      void handleAvailability().then(sendResponse);
      return true;
    }
    return false;
  },
);
