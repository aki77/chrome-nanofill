import type { FormContext, PlannerContext } from "./context";
import { type Persona, PERSONA_SCHEMA } from "./persona";

export const SYSTEM_PROMPT = `You are a helpful assistant that generates plausible-looking dummy values for web form fields during development and testing.

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

export type AvailabilitySnapshot = {
  status: "available" | "downloadable" | "downloading" | "unavailable";
};

export function isPromptApiSupported(): boolean {
  return typeof LanguageModel !== "undefined";
}

export async function probeAvailability(): Promise<AvailabilitySnapshot> {
  if (!isPromptApiSupported()) return { status: "unavailable" };
  const status = await LanguageModel.availability();
  return { status };
}

export type GenerateOptions = {
  context: FormContext;
  onDownloadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

export type GeneratePersonaOptions = {
  input: PlannerContext;
  onDownloadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

function buildUserPrompt(context: FormContext): string {
  return JSON.stringify({
    language: context.pageLanguage,
    page: {
      title: context.pageTitle,
      url: context.pageUrl,
      summary: context.pageSummary,
    },
    persona: context.persona,
    focused: context.focused,
    otherFields: context.siblings,
  });
}

export async function generateValue({
  context,
  onDownloadProgress,
  signal,
}: GenerateOptions): Promise<string> {
  if (!isPromptApiSupported()) {
    throw new Error("Prompt API is not supported in this browser.");
  }

  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
    monitor(m) {
      if (!onDownloadProgress) return;
      m.addEventListener("downloadprogress", (event) => {
        onDownloadProgress(event.loaded, event.total ?? 0);
      });
    },
  });

  try {
    const raw = await session.prompt(buildUserPrompt(context), {
      responseConstraint: RESPONSE_CONSTRAINT,
      signal,
    });

    const parsed = JSON.parse(raw) as { value: unknown };
    if (typeof parsed.value !== "string") {
      throw new Error("Model returned a non-string value.");
    }
    return parsed.value;
  } finally {
    session.destroy();
  }
}

export async function generateValueWithSession(
  session: LanguageModel,
  context: FormContext,
  opts?: { signal?: AbortSignal },
): Promise<string> {
  const raw = await session.prompt(buildUserPrompt(context), {
    responseConstraint: RESPONSE_CONSTRAINT,
    signal: opts?.signal,
  });

  const parsed = JSON.parse(raw) as { value: unknown };
  if (typeof parsed.value !== "string") {
    throw new Error("Model returned a non-string value.");
  }
  return parsed.value;
}

export async function generatePersona({
  input,
  onDownloadProgress,
  signal,
}: GeneratePersonaOptions): Promise<Persona> {
  if (!isPromptApiSupported()) {
    throw new Error("Prompt API is not supported in this browser.");
  }

  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: PLANNER_SYSTEM_PROMPT }],
    monitor(m) {
      if (!onDownloadProgress) return;
      m.addEventListener("downloadprogress", (event) => {
        onDownloadProgress(event.loaded, event.total ?? 0);
      });
    },
  });

  try {
    const userPrompt = JSON.stringify({
      language: input.pageLanguage,
      page: {
        title: input.pageTitle,
        url: input.pageUrl,
        summary: input.pageSummary,
      },
      formFields: input.formFields,
    });

    const raw = await session.prompt(userPrompt, {
      responseConstraint: PERSONA_SCHEMA,
      signal,
    });

    const parsed = JSON.parse(raw) as Persona;
    return parsed;
  } finally {
    session.destroy();
  }
}
