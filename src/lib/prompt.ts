import type { FormContext } from "./context";

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
- For <input> and <select>, ignore the textarea length rules.`;

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
    const userPrompt = JSON.stringify({
      language: context.pageLanguage,
      page: { title: context.pageTitle, url: context.pageUrl },
      focused: context.focused,
      otherFields: context.siblings,
    });

    const raw = await session.prompt(userPrompt, {
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
