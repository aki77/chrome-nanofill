import { PERSONA_SCHEMA } from "../lib/persona";
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
- For <input> and <select>, ignore the textarea length rules.
- If "pageSummary" is provided in the user message, treat it as a high-level hint about what the page is about. Use it to choose plausible values, but do not echo it verbatim.
- If "persona" is provided in the user message, treat it as the single fictional identity filling the entire form. Choose values consistent with persona.fullName, persona.email, persona.addressLine, etc. For textarea / free-form fields, follow persona.scenario, persona.tone, persona.notes. Do not contradict persona fields (e.g., do not invent a new name if persona.fullName is set). Persona fields with value "" mean "not constrained — pick something plausible for this field."`;

const PLANNER_SYSTEM_PROMPT = `You are a "persona planner" for a dummy form-fill assistant.
Given a web page and a list of form fields, decide ONE coherent fictional persona that would plausibly fill the form. Output JSON only.

Rules:
- All data MUST be clearly fictitious. Use example.com/example.org/example.net for emails. Use phone numbers in a clearly fictional range (JP: 03-5550-xxxx style, US: 555-xxx-xxxx style).
- Language and naming conventions MUST match "language" in the user message. Japanese page → Japanese name like 山田太郎, JP address style. English page → English name, US/UK style as appropriate.
- All fields are required; emit "" only if the field truly does not apply (e.g. jobTitle for a personal contact form).
- "scenario", "tone", "notes" describe how this persona would write free-text answers. Keep each under 120 chars.
- dateOfBirth should represent an adult aged 21–55.
- Output ONLY the JSON object matching the schema. No commentary.`;

const RESPONSE_CONSTRAINT = {
  type: "object",
  required: ["value"],
  additionalProperties: false,
  properties: {
    value: { type: "string" },
  },
} as const;

const valueSessionCache = new Map<string, Promise<LanguageModel>>();
const personaSessionCache = new Map<string, Promise<LanguageModel>>();

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

function ensurePersonaSession(outputLanguage: string): Promise<LanguageModel> {
  let p = personaSessionCache.get(outputLanguage);
  if (!p) {
    const opts: LanguageModelCreateOptionsWithLanguage = {
      initialPrompts: [{ role: "system", content: PLANNER_SYSTEM_PROMPT }],
      outputLanguage,
    };
    p = time(`LanguageModel.create (persona/${outputLanguage})`, () =>
      LanguageModel.create(opts),
    ).catch((err) => {
      personaSessionCache.delete(outputLanguage);
      throw err;
    });
    personaSessionCache.set(outputLanguage, p);
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

async function handleGeneratePersona(userPrompt: string, outputLanguage: string): Promise<LlmResponse<string>> {
  const parent = await ensurePersonaSession(outputLanguage);
  const child = await time("parent.clone (persona)", () => parent.clone());
  try {
    const raw = await time("session.prompt (persona)", () =>
      child.prompt(userPrompt, { responseConstraint: PERSONA_SCHEMA }),
    );
    JSON.parse(raw); // throws SyntaxError if model output is not valid JSON
    return { ok: true, value: raw };
  } catch (err) {
    personaSessionCache.delete(outputLanguage);
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
    if (message?.type === "nanofill/llm/generate-persona") {
      void handleGeneratePersona(message.userPrompt, message.outputLanguage).then(sendResponse);
      return true;
    }
    if (message?.type === "nanofill/llm/availability") {
      void handleAvailability().then(sendResponse);
      return true;
    }
    return false;
  },
);
