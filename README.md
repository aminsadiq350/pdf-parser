# Notebook

> Read PDFs, chat with their contents, fully on-device.

Notebook is a frontend-only Vue 3 + TypeScript app that turns any PDF (including
scanned-image PDFs) into a chat-and-cite reading surface. PDFs, threads, and
messages live in your browser's IndexedDB; the only thing that touches the
network is the LLM call itself, and you bring your own API key. The whole app
installs as a PWA and works offline once cached.

## Features

- **Import + render PDFs.** Drag-and-drop or pick files. Per-page text
  extraction via PDF.js; OCR fallback via Tesseract.js for scanned pages.
- **Chat with citations.** Bring your own OpenRouter or Gemini key. The model
  cites pages with `[A:p3]` tokens that we rewrite into clickable chips —
  hover for an inline page preview, click to jump.
- **Smart-context retrieval.** Small docs get fed in whole; large docs get
  BM25 chunk retrieval (token-budgeted via `gpt-tokenizer`'s `cl100k_base`).
- **Threads per doc, library search.** Threads auto-name from your first
  message and auto-clean when empty. Sidebar groups threads by active doc.
- **Viewer essentials.** Zoom (⌘+/⌘−/⌘0), thumbnail strip, in-doc text search
  (⌘F) with snippet matches and prev/next navigation.
- **Mobile-ready.** Sidebar slides in from the left, chat slides from the
  right on tablets and from the bottom on phones.
- **Installable + offline.** Web App Manifest, service worker via
  `vite-plugin-pwa`, full app shell available without network.
- **Export.** Download any thread as Markdown.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the app, paste an OpenRouter or Gemini API key into chat settings, pick a
model, import a PDF, and start chatting.

## Build + serve

```bash
npm run build        # vue-tsc + vite build → dist/
npx serve dist -p 5050 --single
```

The built `dist/` includes a service worker (`sw.js`), Web App Manifest
(`manifest.webmanifest`), and the precached app shell.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR (no service worker — see [vite.config.ts](vite.config.ts#L84)) |
| `npm run build` | Typecheck + production build with PWA assets |
| `npm run preview` | Serve the built `dist/` via Vite's preview server |
| `npm run test` | Vitest in watch mode |
| `npm run test:run` | Vitest one-shot (CI mode) |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run lint` | ESLint (TypeScript + Vue) |
| `npm run format` | Prettier write |
| `npm run icons` | Regenerate PNG icons from [public/icons/source.svg](public/icons/source.svg) |

## Architecture

- **Vue 3 + TypeScript + Vite** — single-file components, Composition API,
  module-singleton composables for shared state.
- **Dexie 4 → IndexedDB.** Four tables: `documents`, `documentBlobs`,
  `threads`, `messages` (compound `[threadId+createdAt]` index, `*docIds`
  multi-entry on threads). See [src/lib/db.ts](src/lib/db.ts).
- **PDF.js 3** for rendering + text extraction. Worker loaded via Vite's
  `?url` import; standard fonts copied into `dist/standard-fonts/` by
  `vite-plugin-static-copy`.
- **Tesseract.js 7** lazy-imported on first OCR run. The Tesseract worker
  itself runs off the main thread; we never touch its internals.
- **MiniSearch** behind a `Retriever` interface; one chunk per page. Token
  budget enforced via `gpt-tokenizer` (also lazy).
- **Tailwind 3** for styling. Dark mode via `prefers-color-scheme` + manual
  toggle.
- **PWA** via `vite-plugin-pwa` + Workbox. App shell precached; PDF.js
  standard fonts and Tesseract CDN assets runtime-cached.

### State pattern

Composables are module-state singletons (refs declared at module top, not
inside the `useXxx()` factory). Every caller gets the same reactive store.
Examples: [useDocuments](src/composables/useDocuments.ts),
[useThreads](src/composables/useThreads.ts),
[useChat](src/composables/useChat.ts),
[usePdfViewer](src/composables/usePdfViewer.ts).

### Citation flow

1. The model emits `[A:p3]` tokens against an alias legend the system prompt
   defines.
2. [parseCitations](src/lib/citations.ts) reads the streamed text and resolves
   aliases to `{docId, pageNumber}` records persisted on the message.
3. [renderCitationsHtml](src/lib/citations.ts) rewrites tokens into
   `<button class="citation-chip">` elements that ChatMessage event-delegates
   for hover preview + click-to-jump.

## Project layout

```
src/
  App.vue                     # 3-pane shell (sidebar | viewer | chat)
  main.ts                     # init Dexie, hydrate stores, register SW
  components/
    AppSidebar.vue            # doc list + thread list + install button
    PdfViewer.vue             # canvas + zoom toolbar + thumbs + search
    ChatPanel.vue             # streaming chat with settings panel
    chat/                     # message bubble, input, citation preview
    sidebar/                  # DocList, ThreadList, EditableLabel
    mobile/                   # MobileChromeBar, DrawerBackdrop
    ui/                       # Toast, generic primitives
    viewer/                   # PdfThumbnailStrip, PdfSearchBar
  composables/                # module-singleton stores
  lib/
    db.ts                     # Dexie schema
    pdf.ts                    # PDF.js wrappers
    pdfIngest.ts              # ingest pipeline: extract + optional OCR
    ocr.ts                    # Tesseract orchestrator + needsOcr heuristic
    retrieval/                # BM25 retriever, Retriever interface
    llm/                      # OpenRouter + Gemini transport, SSE parser
    citations.ts              # parse + render citation chips
    threadName.ts             # auto-title from first message
    threadFilter.ts           # library search
    keyboard.ts               # global shortcut matcher
  types/domain.ts             # Document, Thread, Message, Toast, ...
  styles/main.css             # Tailwind entry + animations
tests/                        # vitest + jsdom + fake-indexeddb (189 specs)
public/icons/                 # PWA icons + favicon
scripts/build-icons.mjs       # one-off PNG generator (sharp)
docs/superpowers/             # per-group specs + plans
```

## Privacy + security

- PDFs are stored as Blobs in IndexedDB on **your** device. They never leave
  the browser.
- The only network egress is the LLM call (OpenRouter or Gemini), the
  Tesseract.js model fetch from `unpkg`/`jsdelivr` on first OCR, and the
  in-app fetches Vite makes during dev.
- API keys are persisted in `localStorage` (cleartext). If your threat model
  needs encrypted-at-rest secrets, don't use this app — there is no
  secret-manager wrapper.
- DOMPurify sanitises model output before render, but you should still treat
  LLM-rendered content as untrusted.

## Browser support

- Chrome / Edge / Brave (chromium): full support, including install prompt.
- Firefox: works; no install prompt (no `beforeinstallprompt`).
- Safari (desktop + iOS): works; install via Safari's "Add to Home Screen".

PDF.js requires a worker, which all the above provide.

## Testing

```
189 specs across 36 files
  vitest + jsdom + fake-indexeddb + @vue/test-utils
```

The test setup ([tests/setup.ts](tests/setup.ts)) stubs jsdom's missing pieces:

- `globalThis.Blob` / `File` → `node:buffer` versions for `fake-indexeddb`
  structuredClone roundtrips.
- `matchMedia` shim with `__setMatchMedia(query, matches)` so composables that
  attach at module load don't crash.
- PDF.js worker `?url` import remapped to an absolute filesystem path.

## License

ISC (or unspecified — see `package.json`).
