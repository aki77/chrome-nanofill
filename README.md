# nanofill

A Chrome extension that uses the browser's built-in Gemini Nano (Prompt API / Summarizer API) to fill **right-clicked form fields** with contextually appropriate dummy values, taking into account surrounding labels, placeholders, other fields, and page content. Supports both single-field fill and whole-form fill.

## Requirements

- Chrome 138 or later
- **Optimization Guide On Device Model** must be available at `chrome://on-device-internals`
- Details: [Built-in AI / Prompt API for Extensions](https://developer.chrome.com/docs/extensions/ai/prompt-api)

## Setup

```bash
pnpm install
pnpm build       # outputs build artifacts to dist/
# During development: pnpm dev (watch mode)
```

## Installation (unpacked)

1. Run `pnpm build`
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `dist/` directory

## Usage

### Fill a single field

1. **Right-click** any form element (input / textarea / select) on a page
2. Click **Fill with Nanofill** in the context menu
3. An indicator appears on the target field; once generation completes, the dummy value is inserted

### Fill the entire form

1. **Right-click** any form element on a page
2. Click **Fill entire form with Nanofill** in the context menu
3. The extension fills the first few fields serially (seeding a fictional identity), then fills the remaining fields in parallel
4. Fields that already have a value are skipped; disabled and read-only fields are never touched
5. Because later fields receive the already-filled values as context, the model naturally produces a consistent fictional identity across name / email / address and free-text answers

Supported elements:
- `<input>` (text / search / email / url / tel / password / number / date / etc.)
- `<textarea>` (generates dummy text scaled to the element's height — see below)
- `<select>` (model picks one option based on the option labels)

### Indicator

A status badge is shown in the top-right corner of the field during generation:

| State | Display |
|-------|---------|
| Analyzing page | ✨ Analyzing page… |
| Generating value | ✨ Filling… |
| Failed | ⚠️ Failed (red · disappears after 1.5 s) |

### Auto-estimation of textarea length

For `<textarea>`, the effective row count is estimated from the `rows` attribute or `clientHeight / line-height`, and passed to the model as one of three length hints:

| Effective rows | lengthHint | Output |
|---------------|-----------|--------|
| 1–2 rows | short | 1–2 sentences |
| 3–6 rows | medium | 1 paragraph (2–4 sentences) |
| 7+ rows | long | Multiple paragraphs (separated by `\n\n`) |

### Context enhancement via page summarization

The text of the page containing the form is summarized with the Summarizer API and included in the value-generation prompt. The summary is cached in `chrome.storage.session` for 24 hours (keyed by URL and content hash), so subsequent requests on the same page are served instantly.

## Architecture

```
src/
├── background/background.ts   # service worker: contextMenu management + fill trigger + offscreen lifetime
├── content/
│   ├── content.ts             # right-click tracking + context collection + DOM update
│   └── feedback.ts            # generation indicator (badge + field highlight)
├── offscreen/
│   ├── offscreen.html         # minimal HTML shell for the offscreen document
│   └── offscreen.ts           # long-lived LanguageModel session + message handler
└── lib/
    ├── cache.ts               # session storage cache for page summaries
    ├── context.ts             # focus / right-click element detection / FormContext construction
    ├── extract.ts             # page body extraction via Defuddle
    ├── prompt.ts              # thin client: sends LLM requests to the offscreen document
    ├── summarize.ts           # Summarizer API wrapper (map-reduce chunk support)
    └── types.ts               # message types
```

Right-click → the background service worker receives `chrome.contextMenus.onClicked` and sends either a `nanofill/fill` or `nanofill/fill-all` message to the content script in the target frame using `frameId`. Prompt API calls are routed through an **offscreen document** that keeps a long-lived `LanguageModel` session alive across all tabs for the lifetime of the extension. The content script sends `nanofill/llm/*` messages via `chrome.runtime.sendMessage`; the offscreen handler responds by calling `session.clone()` → `prompt()` → `destroy()` and returning the result. This means `LanguageModel.create()` runs only once (on extension install/startup), not on every fill request.

For whole-form fill, the content script uses a **seed-first** strategy: the first few fields are filled serially so their values become visible in the `currentValue` of siblings for subsequent prompts. The remaining fields are then filled in parallel (concurrency = 2). The model reads the already-filled sibling values and naturally produces a consistent fictional identity across all fields.

## Known Limitations

- Generated values are AI output and may not always satisfy strict field validation.
- Does not work on pages where Chrome extensions cannot inject content scripts (e.g. `chrome://`).
- On first use, generation is blocked until the model download (~several GB) completes.
- If the Summarizer API is unavailable, values are generated without page summarization.
- A browser console warning "No output language was specified in a LanguageModel API request" appears in the offscreen document. This is harmless — `outputLanguage` is passed to `LanguageModel.create()` but the `clone()` call used for concurrent requests does not inherit it (Chrome API limitation). Output quality is not affected.
