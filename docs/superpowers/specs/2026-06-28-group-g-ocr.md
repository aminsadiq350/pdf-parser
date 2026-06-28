# Group G — OCR for Scanned PDFs

## Problem

`readPdf` (in `src/lib/pdf.ts`) extracts text via PDF.js
`page.getTextContent()`. For digitally-generated PDFs this returns proper
text. For scanned-image PDFs (photographed paper, faxes, screenshots) the
text layer is empty or near-empty → the doc has `pages: [{text: ''}]` →
retrieval index has nothing to match → the chat says "no context found"
and the user is stuck.

We want to detect those pages on import and OCR them so the same chat
flow that works for digital PDFs also works for scanned ones — without
any backend.

## Goals

1. Pages whose extracted text is below a threshold are OCR'd at import
   time using Tesseract.js (which runs in its own Worker — no main-thread
   freeze).
2. UX visibility while it runs: a per-doc progress toast so the user
   knows "OCR page 2 of 5…" is happening, not a hang.
3. Default ON for English; users can disable in settings if they only
   handle text PDFs and want to avoid the model download.
4. Tesseract's model cache (handled internally via IndexedDB) survives
   page reloads.
5. The chat/retrieval flow stays the same after import — pages get text,
   retrieval indexes them, chat works.

## Non-goals

- Languages other than English in v1 (`eng` only).
- On-demand re-OCR for already-imported docs (re-import to re-OCR).
- OCR'ing PDFs uploaded by the user as images (PNG/JPG outside PDF).
- Wrapping Tesseract in our own Worker — its v5 worker already runs
  off-thread.
- Layout-aware OCR (columns, tables). We keep the simple paragraph mode.

## Solution

### Detection heuristic

`needsOcr(text: string): boolean` returns `true` when the extracted
plain text has fewer than 20 non-whitespace characters. This catches:
- Completely empty pages.
- Pages with only stray glyphs (page numbers, watermarks).

Edge case: a blank page in a scanned doc will (correctly) try OCR and
yield nothing, no harm done.

### OCR helper

`src/lib/ocr.ts` exposes:

```ts
export interface OcrProgress { page: number; total: number; pct?: number }
export type OcrProgressFn = (p: OcrProgress) => void

export async function ocrPagesIfNeeded(
  pdf: PDFDocumentProxy,
  pages: PageText[],
  opts?: { onProgress?: OcrProgressFn; signal?: AbortSignal },
): Promise<PageText[]>
```

Internals:
- Lazy `import('tesseract.js')` on first call so the ~600KB JS + 10MB
  worker assets don't ship in the initial bundle.
- Maintains a module-level `worker: Tesseract.Worker | null` so the
  20-30s initial model load happens once per session.
- For each page where `needsOcr(text)`:
  - Get the page, render to an off-screen canvas at scale 2.0
    (Tesseract prefers high-resolution input).
  - Call `worker.recognize(canvas)`.
  - Replace `pages[i].text` with the recognised text trimmed.
  - Call `onProgress({ page: i+1, total: pages.length })`.
- Always terminate the worker on completion (frees ~30MB RAM).

### Wiring into import

`src/composables/useDocuments.ts.importFiles`:

```ts
const { numPages, pages: rawPages } = await readPdf(buffer)
let pages = rawPages
if (settings.ocrEnabled.value) {
  const pdf = await loadPdf(buffer) // we already have one from readPdf
  pages = await ocrPagesIfNeeded(pdf, rawPages, {
    onProgress: ({ page, total }) =>
      toasts.show(`OCR ${file.name} — page ${page}/${total}…`, 'info', 1500),
  })
}
```

Adjust: `readPdf` currently loads its own PDF.js doc and discards it.
Refactor it to optionally return the `PDFDocumentProxy` so we don't
double-load. Cheaper: introduce `extractPagesWithOcr(buffer, opts)`
that does the whole pipeline.

Concrete plan: keep `readPdf` as-is (it's pure). Add a new orchestrator
`ingestPdf(buffer, opts)` in `src/lib/pdfIngest.ts` that calls `readPdf`
then optionally `ocrPagesIfNeeded`. `useDocuments.importFiles` calls
`ingestPdf` instead of `readPdf`.

### Settings

Extend `useSettings` with:

- `ocrEnabled: Ref<boolean>` defaulting to `true`, persisted in
  localStorage under `notebook.ocrEnabled`.

A toggle row appears in `ChatPanel`'s settings panel under the existing
provider/key/model fields:

```
[ x ] OCR scanned pages
        First scan downloads a ~10MB model. English only for v1.
```

### Test strategy

Pure helpers:
- `needsOcr('')` → true
- `needsOcr('   \n\t')` → true
- `needsOcr('1')` → true (1 char < 20)
- `needsOcr('hello world ' + 'x'.repeat(20))` → false
- `needsOcr(longText)` → false

OCR orchestrator (`ocrPagesIfNeeded`):
- Mocks `tesseract.js` import to return a fake worker that resolves
  `recognize` with deterministic text.
- Test that pages with text are left alone.
- Test that pages without text get the mocked OCR text.
- Test the progress callback fires once per OCR'd page.
- Test the AbortSignal short-circuits the loop.

`pdfIngest` integration:
- Mock `ocrPagesIfNeeded` to flip empty pages to "ocr'd content".
- Feed a synthetic PDF where page 1 has text and page 2 is empty.
- Assert page 1 unchanged, page 2 has "ocr'd content".

Component-level:
- Settings toggle reads/writes `ocrEnabled` to localStorage.

E2E (manual): out of scope for the test fixture; verified by inspecting
the toast appearing when a real scanned PDF is imported.

## Risks

- **Tesseract worker init is heavy (~30s first time)** — show progress;
  consider deferring worker init until first page actually needs OCR
  (not on app startup).
- **Canvas size** — at scale 2.0 a single letter page is ~1700x2200
  pixels; ~15MB raw bitmap. Tesseract internally handles compression.
  Acceptable on desktop; on phone we may want a lower scale. v1 ships
  scale 2.0 everywhere.
- **`tesseract.js` brings ~600KB of JS plus core WASM + traineddata** —
  all loaded lazily, all cached in IndexedDB by Tesseract.
- **Test isolation** — fake-indexeddb + mocking the dynamic
  `import('tesseract.js')` requires `vi.mock` at the top of the test
  file. Mock must satisfy the `Tesseract.createWorker()` shape.

## Out-of-scope follow-ups

- Multi-language traineddata.
- On-demand re-OCR for existing docs (button in DocItem).
- OCR on direct image uploads (PNG/JPG).
- Streaming OCR results into the retriever as each page completes.
