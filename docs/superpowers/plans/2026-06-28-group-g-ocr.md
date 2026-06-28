# Plan — Group G OCR

Spec: `2026-06-28-group-g-ocr.md`

Six tasks, continuous-run, verification gate at the end.

## Task 1 — `needsOcr` helper

`src/lib/ocr.ts` (initial cut, just the pure helper).

`tests/lib/ocr.spec.ts` — 5 cases:
- empty string → true
- whitespace only → true
- 1 char → true
- 20+ non-whitespace chars → false
- mixed whitespace counts only non-whitespace

**Commit:** `feat(g1): needsOcr threshold helper`

## Task 2 — Tesseract install + `ocrPagesIfNeeded` orchestrator

`npm install tesseract.js` (pin to v5).

Extend `src/lib/ocr.ts` with `ocrPagesIfNeeded(pdf, pages, opts)`:
- Lazy `import('tesseract.js')` and cache the worker.
- Loop pages, OCR the ones flagged by `needsOcr`.
- Render each via `pdf.getPage(n).render(...)` to a canvas.
- Progress callback after each completed page.
- AbortSignal short-circuit.
- Returns a new pages array.

`tests/lib/ocrPagesIfNeeded.spec.ts`:
- `vi.mock('tesseract.js', ...)` returns a stub worker.
- Stub `pdf.getPage(n)` to a fake page that renders 1x1 white onto the
  test's OffscreenCanvas (jsdom has Canvas via the `canvas` package... if
  not installed, use a HTMLCanvasElement stub).
- Verify: pages with text untouched; empty pages replaced by mock OCR;
  progress called N times; abort halts.

**Commit:** `feat(g2): ocrPagesIfNeeded orchestrator with lazy tesseract`

## Task 3 — `pdfIngest` orchestrator + wire to import

`src/lib/pdfIngest.ts`:

```ts
export async function ingestPdf(buffer: ArrayBuffer, opts: {
  ocr: boolean
  onProgress?: OcrProgressFn
  signal?: AbortSignal
}): Promise<{ numPages: number; pages: PageText[] }>
```

- Calls `readPdf` to get numPages + raw pages.
- If `opts.ocr`, loads the PDF.js document and calls
  `ocrPagesIfNeeded(pdf, pages, opts)`.
- Returns the (maybe-augmented) pages.

`useDocuments.importFiles` swaps `readPdf` → `ingestPdf({ ocr:
settings.ocrEnabled.value, onProgress })` where the progress callback
posts toasts.

Tests:
- `ingestPdf` with `ocr: false` does NOT call the OCR path.
- `ingestPdf` with `ocr: true` and an empty-text page calls OCR.

**Commit:** `feat(g3): pdfIngest pipeline + importFiles wires OCR with progress toasts`

## Task 4 — Settings toggle (`ocrEnabled`)

Extend `useSettings`:
- Add `ocrEnabled: Ref<boolean>` (default `true`).
- Persist to localStorage under `notebook.ocrEnabled`.

Render a checkbox in `ChatPanel`'s settings panel:
```
[x] OCR scanned pages
    First scan downloads a ~10MB model. English only for v1.
```

Tests:
- `useSettings` reads/writes ocrEnabled.
- Defaults to true on cold start.
- Survives reload via localStorage.

**Commit:** `feat(g4): ocrEnabled setting + ChatPanel toggle`

## Task 5 — Test setup additions

`tests/setup.ts` may need:
- jsdom stub for `OffscreenCanvas` or document.createElement('canvas').
- Mocking strategy doc — point at where tests should stub Tesseract.

`vi.mock` of `tesseract.js` in the orchestrator test, ensuring lazy
import path is covered.

If we discover that the OCR orchestrator can't be mocked without
Node-side issues, simplify by extracting the pure orchestration loop
into a function that takes an `engine: (canvas) => Promise<string>` and
testing that.

**Commit:** none (folded into the test files where needed).

## Task 6 — Verify + tag

1. `npm run typecheck && npm run lint && npm run test:run && npm run build`.
2. Live verification:
   - Toggle the OCR setting off, import a (text) PDF — works as before.
   - Toggle on, import same PDF — works, no OCR triggered (text > 20).
   - (If we can find a scanned PDF fixture) import → progress toasts →
     pages have text → retrieval+chat works. If no fixture handy,
     verified by code review of the orchestrator path.
3. `git tag -a group-g-ocr -m "Group G: ocr for scanned pdfs"`.

**Commit:** none.

## Pacing

Continuous. Real bugs surface as `fix(gN): …` commits before the tag.
