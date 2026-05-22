import Defuddle from "defuddle";

const MIN_WORD_COUNT = 40;
const MAX_OUTPUT_CHARS = 16_000;

export type ExtractedPage = {
  text: string;
  title?: string;
  source: "defuddle" | "innerText";
};

export function extractPageText(doc: Document = document): ExtractedPage {
  try {
    const result = new Defuddle(doc, { markdown: false }).parse();
    const wordCount = result.wordCount ?? estimateWords(result.content);
    if (wordCount >= MIN_WORD_COUNT && result.content) {
      const text = htmlToPlainText(result.content, doc);
      return {
        text: clip(text),
        title: result.title || undefined,
        source: "defuddle",
      };
    }
  } catch {
    // fallthrough to innerText
  }
  const fallback = doc.body?.innerText ?? "";
  return {
    text: clip(fallback.replace(/\n{3,}/g, "\n\n").trim()),
    source: "innerText",
  };
}

function htmlToPlainText(html: string, doc: Document): string {
  const container = doc.implementation.createHTMLDocument("").body;
  container.innerHTML = html;
  const text = container.textContent ?? "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function estimateWords(html: string): number {
  return (html.replace(/<[^>]+>/g, " ").match(/\S+/g) ?? []).length;
}

function clip(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) : s;
}
