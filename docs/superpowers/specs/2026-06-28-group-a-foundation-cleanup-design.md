# Notebook — Group A: Foundation Cleanup Design Spec

**Date:** 2026-06-28
**Status:** Approved
**Scope:** Four small, independent foundation improvements bundled into one ship cycle. None depend on each other; each one cleans up a known limitation from M1–M3.

---

## 1. Summary

Four standalone fixes, all frontend-only, no design forks:

- **A1.** Replace the 800KB `public/standard-fonts/` (committed in M1) with a `vite-plugin-static-copy` step that pulls fonts from `node_modules/pdfjs-dist/standard_fonts/` at dev + build time.
- **A2.** Swap M3's `chars / 4` token estimate for `gpt-tokenizer` (cl100k_base, JS-only, ~150KB gzip).
- **A3.** Request durable storage from the browser (`navigator.storage.persist()`) once at app start so IndexedDB isn't evicted under quota pressure.
- **A4.** Scaffold component-render tests with `@vue/test-utils` (already installed). Three representative SFCs: `ChatMessage`, `ChatInput`, `AttachedDocsBar`.

---

## 2. Goals

- Drop binary fonts from git (`public/standard-fonts/` deleted, kept generated).
- Token budget decision in `useChat` reflects real tokenizer output, not an estimate.
- IndexedDB gets `persistent` storage where the browser allows it (best-effort).
- A vetted pattern for testing Vue SFCs exists, with three live examples.

## 3. Non-goals

- A4 doesn't aim for full SFC coverage — sidebar/viewer/sidebar-item tests land in the groups that touch those files (B, C, etc.).
- A3 doesn't ship onboarding UI explaining the permission to the user; if a browser surfaces a prompt, that's the only UX. Onboarding lives in Group B.
- A2 doesn't switch to model-specific tokenizers (Gemini, etc.) — cl100k_base is close enough for budgeting given the 25% safety buffer; per-model tokenizers go to a later micro-task if needed.
- A1 stays on `vite-plugin-static-copy`. Not switching to a manual postinstall script.

## 4. Constraints

- 100% frontend, no backend.
- No regression in existing 60 unit tests.
- Build output size grows only by the gpt-tokenizer payload (~150KB gzip).
- Browser support: same matrix as M3 (modern evergreen browsers).

## 5. Design

### A1 — vite-plugin-static-copy

```ts
// vite.config.ts
import { viteStaticCopy } from 'vite-plugin-static-copy'

plugins: [
  vue(),
  viteStaticCopy({
    targets: [
      {
        src: 'node_modules/pdfjs-dist/standard_fonts/*',
        dest: 'standard-fonts',
      },
    ],
  }),
]
```

- Dev server serves from the staged location automatically (the plugin handles both modes).
- `public/standard-fonts/` directory + 16 font files deleted from working tree and git tracking.
- `.gitignore` gains `public/standard-fonts/` so a fresh `npm install` + accidental local copy never re-tracks them.
- `lib/pdf.ts`'s `STANDARD_FONT_DATA_URL = '/standard-fonts/'` is unchanged.

### A2 — Real tokenizer

```ts
// src/lib/tokenizer.ts
import { encode } from 'gpt-tokenizer'

/** Returns the cl100k_base token count of the given text. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return encode(text).length
}
```

- Drop-in replacement for `totalChars / 4` in `useChat.buildContextSection`.
- Tests: single short string, empty string, repeated-char string (sanity check that the count is non-trivial).

### A3 — Durable storage

```ts
// src/lib/durableStorage.ts
export async function requestDurableStorage(): Promise<{
  supported: boolean
  persisted: boolean
}> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return { supported: false, persisted: false }
  }
  try {
    if (await navigator.storage.persisted()) {
      return { supported: true, persisted: true }
    }
    return { supported: true, persisted: await navigator.storage.persist() }
  } catch {
    return { supported: true, persisted: false }
  }
}
```

- Called once after `initStore()` in `main.ts`.
- Fire-and-forget — return value is ignored at the call site (could feed a future onboarding nudge).
- No toast / no prompt of our own. Some browsers will surface their own permission UI; others silently grant.
- No tests beyond a type-check — the body is a wrapper around environment APIs that don't exist in jsdom.

### A4 — Component-render tests

Setup: existing `tests/setup.ts` already covers vitest globals + jsdom + localStorage shim. No additions needed.

**`tests/components/chat/ChatMessage.spec.ts`** — renders user variant, assistant variant, citation-chip variant; clicking a chip calls a mocked `jumpToPage`; error footer appears when `msg.error`.

**`tests/components/chat/ChatInput.spec.ts`** — typing + Enter emits `send`; while `streaming=true` the Stop button is shown and submitting emits `stop`.

**`tests/components/chat/AttachedDocsBar.spec.ts`** — chips render for each attached doc; × emits detach via the mocked composable; + toggles picker visibility.

Composables that the components touch (`useDocuments`, `useThreads`, `usePdfViewer`) are stubbed via `vi.mock()` to keep tests hermetic and avoid bringing Dexie into the render path.

---

## 6. Definition of Done

- `du -sh public/` < 50KB (was 800KB).
- `npm run build` includes generated `dist/standard-fonts/*.ttf`.
- `npm run test:run` — 60 prior tests still pass + 10ish new tests; total ≥ 70.
- `useChat.buildContextSection` calls `estimateTokens` not `length / 4`.
- `requestDurableStorage` runs on app start; the call site doesn't await its result.
- Three component specs exist and pass.

## 7. Risks

- **`vite-plugin-static-copy` Vite 5 compatibility.** The plugin is actively maintained; pinning a recent version (`^2.0`) avoids churn.
- **gpt-tokenizer bundle bloat.** ~150KB gzip. Worth it for accurate budgeting. Verify total bundle in build output.
- **Firefox may show a permission prompt for `persist()`.** Acceptable — better than silently losing data.
- **Component tests may flake on async UI** (CSS transitions, focus). Keep them DOM-state focused, not animation-timing focused.
