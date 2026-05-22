import { mark, time } from "./debug";

const SHARED_CONTEXT =
  "This text is a web page that contains (or links to) a form the user is filling. " +
  "Identify what the page is about so that another model can generate plausible dummy data for the form.";

const SUMMARIZE_OPTIONS = {
  type: "key-points" as const,
  format: "plain-text" as const,
  length: "short" as const,
};

const CHUNK_SAFETY = 0.85;
const MAX_CHUNKS = 6;

export type SummarizeOptions = {
  language?: string;
  signal?: AbortSignal;
};

export async function summarizePageText(
  text: string,
  options: SummarizeOptions = {},
): Promise<string | null> {
  if (typeof Summarizer === "undefined") return null;
  if (!text.trim()) return null;

  let avail: Awaited<ReturnType<typeof Summarizer.availability>>;
  try {
    avail = await Summarizer.availability(SUMMARIZE_OPTIONS);
  } catch {
    return null;
  }
  if (avail === "unavailable") return null;

  let summarizer: Summarizer;
  try {
    summarizer = await time("Summarizer.create", () =>
      Summarizer.create({
        ...SUMMARIZE_OPTIONS,
        sharedContext: SHARED_CONTEXT,
        outputLanguage: options.language,
        signal: options.signal,
      }),
    );
  } catch {
    return null;
  }

  try {
    const quota = summarizer.inputQuota;
    const usage = await summarizer.measureInputUsage(text, {
      signal: options.signal,
    });

    if (usage <= quota * CHUNK_SAFETY) {
      return await time("summarizer.summarize (single)", () =>
        summarizer.summarize(text, { signal: options.signal }),
      );
    }

    // map-reduce: split by paragraph → summarize each chunk → concat → re-summarize
    const tokensPerChar = text.length > 0 ? usage / text.length : 1;
    const chunks = chunkByQuota(text, quota * CHUNK_SAFETY, tokensPerChar);
    const limited = chunks.slice(0, MAX_CHUNKS);
    mark(`summarizer map-reduce: ${limited.length} chunks`);

    const partials: string[] = [];
    for (let i = 0; i < limited.length; i++) {
      try {
        partials.push(
          await time(`summarizer.summarize (chunk ${i + 1}/${limited.length})`, () =>
            summarizer.summarize(limited[i], { signal: options.signal }),
          ),
        );
      } catch {
        // ignore individual chunk failures
      }
    }
    if (partials.length === 0) return null;

    const merged = partials.join("\n\n");
    try {
      return await time("summarizer.summarize (merge)", () =>
        summarizer.summarize(merged, { signal: options.signal }),
      );
    } catch {
      return merged;
    }
  } catch {
    return null;
  } finally {
    summarizer.destroy();
  }
}

function chunkByQuota(
  text: string,
  tokenBudget: number,
  tokensPerChar: number,
): string[] {
  const charBudget = Math.max(
    800,
    Math.floor(tokenBudget / Math.max(tokensPerChar, 0.001)),
  );
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length > charBudget) {
      if (buf) chunks.push(buf);
      buf = p.length > charBudget ? p.slice(0, charBudget) : p;
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
