# nanofill

## Development Rules
- Whenever the spec/behavior changes, update README.md to reflect it.

## Commands
- `pnpm build` - type-check (tsc) + bundle (vite); no separate typecheck command
- `pnpm dev` - watch mode for development

## Architecture
- `src/lib/` — pure logic (no DOM): context, prompt, persona, summarize, cache, extract
- `src/content/` — content script (DOM access): content.ts orchestrates fills, feedback.ts manages UI badges
- `src/background/` — service worker: context menu setup + message relay

## Key Patterns
- Fallible operations return `{ ok: true; value } | { ok: false; detail? }` — no throws at call sites
- `showFeedback(target, { multi?: boolean })` controls per-field status badges; `multi: true` allows simultaneous badges
- Chrome Prompt API types (`LanguageModel` etc.) are global — no import needed
- `session.clone()` is used in batch fill to share a parent session and avoid repeating system-prompt setup
