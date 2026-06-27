# Notebook — M1 Foundation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the single-file `index.html` Vue + Tailwind + PDF.js app to a modular Vite + TypeScript + Vue 3 SFC project with Vitest scaffolded, while keeping every user-visible behavior identical to today's app.

**Architecture:** Replace the monolithic `index.html` with a Vite-built project. Decompose today's logic into pure `lib/` modules (TDD'd), reactive `composables/` (TDD'd where they own logic), and presentational `components/` (manual parity check, no component-render tests in M1). All state stays in-memory — Dexie + retrieval land in M2 / M3.

**Tech Stack:** Vite 5, Vue 3.4, TypeScript 5, Tailwind v3 via PostCSS, PDF.js 3.11, `marked`, `DOMPurify`, `KaTeX`, `@fortawesome/fontawesome-free`, Vitest, `@vue/test-utils`, ESLint flat config, Prettier.

**Reference for porting:** `index.html` at the repo root is the canonical spec for behavior. Every Vue component below is ported from that file with no behavior change.

---

## File Structure (created/modified in M1)

```
package.json                            new
tsconfig.json                           new
tsconfig.node.json                      new
vite.config.ts                          new
postcss.config.js                       new
tailwind.config.ts                      new
.prettierrc                             new
eslint.config.js                        new
.vscode/extensions.json                 new
index.html                              REPLACED (Vite entry)
.gitignore                              already exists; extend if needed

src/
  main.ts                               app bootstrap
  App.vue                               3-pane layout shell
  styles/main.css                       Tailwind directives + animations
  types/domain.ts                       Document, Toast (Thread/Message land in M2)
  components/
    AppSidebar.vue                      doc list + dark toggle + import button
    PdfViewer.vue                       canvas + prev/next + page indicator
    ChatPanel.vue                       header + settings drawer + msgs + input
    chat/
      ChatMessage.vue                   markdown render + role styling
      ChatInput.vue                     send-only in M1 (no abort yet)
      TypingIndicator.vue
    ui/
      Toast.vue
  composables/
    useDarkMode.ts
    useToasts.ts
    useSettings.ts                      provider/key/model (localStorage)
    useDocuments.ts                     in-memory list + active id
    usePdfViewer.ts                     render + page nav
    useChat.ts                          in-memory messages + send/stream
  lib/
    format.ts                           marked + DOMPurify
    katex.ts                            auto-render thin glue
    pdf.ts                              PDF.js load + extractTextByPage
    llm/
      types.ts                          LlmClient interface
      promptBuilder.ts                  identity + optional full-doc context
      streamParser.ts                   SSE chunk parser (both providers)
      openrouter.ts                     thin OpenAI-compat client
      gemini.ts                         thin Gemini streamGenerateContent client

tests/
  setup.ts                              fake-indexeddb stub for later, dom env
  smoke.spec.ts                         vitest sanity
  fixtures/sample.pdf                   ~25 KB committed PDF
  lib/format.spec.ts
  lib/streamParser.spec.ts
  lib/promptBuilder.spec.ts
  lib/pdf.spec.ts
  composables/useSettings.spec.ts
  composables/useChat.spec.ts           (mocks fetch)
```

**Deleted at end of M1 (after parity check, Task 25):** the *old* monolithic `index.html` is overwritten by Vite's new entry; the original 450-line file no longer exists in the working tree after Task 4.

---

## Task 1 — Initialize npm package + install runtime deps

**Files:**
- Create: `package.json` (via `npm init -y` then edited)

- [ ] **Step 1.1 — Verify Node ≥ 18.18**

```bash
node --version
```
Expected: prints `v18.18.x` or higher (Vite 5 requires it). If lower, install Node 20 LTS via the user's preferred manager before continuing.

- [ ] **Step 1.2 — Initialize the package**

```bash
cd /Users/aminsadiq/Desktop/ValetProjects/pdf-parser
npm init -y
```

- [ ] **Step 1.3 — Replace `package.json` with the final scripts + metadata**

```json
{
  "name": "notebook",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Frontend-only PDF reader with AI chat.",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

- [ ] **Step 1.4 — Install runtime deps**

```bash
npm install vue@^3.4 pdfjs-dist@^3.11.174 marked@^9.1.6 dompurify@^3.0.6 katex@^0.16.9 minisearch@^7.1.0 @fortawesome/fontawesome-free@^6.4.0
```

> `minisearch` is installed now (used in M3) so we lockfile it once. Same with `dompurify`/`katex` versions matching the current CDN.

- [ ] **Step 1.5 — Install dev deps**

```bash
npm install -D vite@^5.4 @vitejs/plugin-vue@^5.1 typescript@^5.5 vue-tsc@^2.1 @vue/test-utils@^2.4 vitest@^2.1 jsdom@^25.0 tailwindcss@^3.4 postcss@^8.4 autoprefixer@^10.4 eslint@^9.10 @typescript-eslint/parser@^8.6 @typescript-eslint/eslint-plugin@^8.6 eslint-plugin-vue@^9.28 prettier@^3.3 @types/dompurify@^3.0 @types/marked@^5.0 @types/katex@^0.16
```

- [ ] **Step 1.6 — Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: init npm package with vite/vue/ts toolchain"
```

---

## Task 2 — Configure TypeScript

**Files:**
- Create: `tsconfig.json`, `tsconfig.node.json`

- [ ] **Step 2.1 — Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2.2 — Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "tailwind.config.ts", "postcss.config.js", "eslint.config.js"]
}
```

- [ ] **Step 2.3 — Verify typecheck on empty src (will pass with no files yet)**

```bash
npx vue-tsc --noEmit
```
Expected: exits 0 with no output (or warns "no files matched" — also OK at this stage).

- [ ] **Step 2.4 — Commit**

```bash
git add tsconfig.json tsconfig.node.json
git commit -m "chore: add typescript config"
```

---

## Task 3 — Configure Vite

**Files:**
- Create: `vite.config.ts`

- [ ] **Step 3.1 — Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, open: false },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
})
```

- [ ] **Step 3.2 — Commit**

```bash
git add vite.config.ts
git commit -m "chore: add vite config with vue plugin and vitest"
```

---

## Task 4 — Replace `index.html` with the Vite entry

**Files:**
- Modify: `index.html` (root) — **fully replaced**

- [ ] **Step 4.1 — Overwrite `index.html`**

```html
<!doctype html>
<html lang="en" class="h-full">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Notebook</title>
  </head>
  <body class="h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

The original 450-line monolith is now gone. Its behavior gets ported into the SFCs that follow.

- [ ] **Step 4.2 — Commit**

```bash
git add index.html
git commit -m "chore(m1): replace monolithic index.html with vite entry shell"
```

---

## Task 5 — Configure Tailwind + PostCSS

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`, `src/styles/main.css`

- [ ] **Step 5.1 — Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts,js}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

- [ ] **Step 5.2 — Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5.3 — Create `src/styles/main.css`** (Tailwind directives + the bespoke CSS the original used)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '@fortawesome/fontawesome-free/css/all.min.css';
@import 'katex/dist/katex.min.css';

[v-cloak] { display: none; }
.katex-display { overflow-x: auto; overflow-y: hidden; }

.typing-dot { animation: typingBounce 1.4s infinite ease-in-out both; }
.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes typingBounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.settings-panel {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.2s ease;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.settings-panel.open {
  max-height: 400px;
  opacity: 1;
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.toast-enter { animation: toastIn 0.3s ease forwards; }
.toast-exit { animation: toastOut 0.3s ease forwards; }
@keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes toastOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-20px); opacity: 0; } }

.msg-enter { animation: msgSlideIn 0.25s ease forwards; }
@keyframes msgSlideIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.user-msg-prose .prose { color: inherit; }
.user-msg-prose .prose p { color: inherit; margin: 0; }
.user-msg-prose .prose strong { color: inherit; }
.user-msg-prose .prose code { color: inherit; background: rgba(255, 255, 255, 0.15); }

#chat-container::-webkit-scrollbar { width: 4px; }
#chat-container::-webkit-scrollbar-track { background: transparent; }
#chat-container::-webkit-scrollbar-thumb { background: #a1a1aa; border-radius: 2px; }
.dark #chat-container::-webkit-scrollbar-thumb { background: #52525b; }

.pulse-dot { animation: pulse 2s infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

- [ ] **Step 5.4 — Commit**

```bash
git add tailwind.config.ts postcss.config.js src/styles/main.css
git commit -m "chore: wire tailwind + postcss + base styles"
```

---

## Task 6 — Configure Vitest setup + smoke test

**Files:**
- Create: `tests/setup.ts`, `tests/smoke.spec.ts`

- [ ] **Step 6.1 — Create `tests/setup.ts`** (no-op for now; populated for later tasks)

```ts
// Vitest global setup. Extend as tests grow.
import { vi } from 'vitest'

// Mock localStorage with an in-memory shim so useSettings tests run cleanly.
class MemoryStorage {
  private store = new Map<string, string>()
  get length(): number { return this.store.size }
  clear(): void { this.store.clear() }
  getItem(k: string): string | null { return this.store.get(k) ?? null }
  setItem(k: string, v: string): void { this.store.set(k, v) }
  removeItem(k: string): void { this.store.delete(k) }
  key(i: number): string | null { return [...this.store.keys()][i] ?? null }
}

vi.stubGlobal('localStorage', new MemoryStorage())
```

- [ ] **Step 6.2 — Create `tests/smoke.spec.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('arithmetic still works', () => {
    expect(2 + 2).toBe(4)
  })

  it('jsdom DOM is available', () => {
    document.body.innerHTML = '<p>hi</p>'
    expect(document.querySelector('p')?.textContent).toBe('hi')
  })

  it('localStorage shim works', () => {
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })
})
```

- [ ] **Step 6.3 — Run tests**

```bash
npm run test:run
```
Expected: 3 tests pass, 0 fail.

- [ ] **Step 6.4 — Commit**

```bash
git add tests/setup.ts tests/smoke.spec.ts
git commit -m "test: add vitest setup and smoke test"
```

---

## Task 7 — Configure ESLint + Prettier + VS Code extensions hint

**Files:**
- Create: `eslint.config.js`, `.prettierrc`, `.vscode/extensions.json`

- [ ] **Step 7.1 — Create `eslint.config.js`** (flat config)

```js
import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module', extraFileExtensions: ['.vue'] },
    },
    plugins: { '@typescript-eslint': tseslint, vue },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...vue.configs['flat/recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },
]
```

> If `vue-eslint-parser` is missing, install it: `npm i -D vue-eslint-parser@^9.4`.

- [ ] **Step 7.2 — Install `vue-eslint-parser`**

```bash
npm install -D vue-eslint-parser@^9.4 @eslint/js@^9.10
```

- [ ] **Step 7.3 — Create `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "vueIndentScriptAndStyle": true
}
```

- [ ] **Step 7.4 — Create `.vscode/extensions.json`**

```json
{
  "recommendations": ["Vue.volar", "esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]
}
```

- [ ] **Step 7.5 — Run lint (expected: zero files matched yet, exit 0)**

```bash
npm run lint
```

- [ ] **Step 7.6 — Commit**

```bash
git add eslint.config.js .prettierrc .vscode/extensions.json package.json package-lock.json
git commit -m "chore: configure eslint + prettier"
```

---

## Task 8 — Define domain types

**Files:**
- Create: `src/types/domain.ts`

- [ ] **Step 8.1 — Create `src/types/domain.ts`**

```ts
// Domain types for M1. Thread/Message/Citation land in M2/M3.

export type Provider = 'openrouter' | 'gemini'

export interface PdfDocument {
  /** In-memory id (monotonic counter; replaced by Dexie autoIncrement in M2). */
  id: number
  name: string
  /** Raw PDF bytes. In M2 this moves to a separate Dexie store. */
  data: ArrayBuffer
  numPages: number
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
  leaving?: boolean
}
```

- [ ] **Step 8.2 — Commit**

```bash
git add src/types/domain.ts
git commit -m "feat(m1): add domain types"
```

---

## Task 9 — `lib/format.ts` (TDD)

**Files:**
- Create: `src/lib/format.ts`
- Test: `tests/lib/format.spec.ts`

- [ ] **Step 9.1 — Write failing test**

```ts
// tests/lib/format.spec.ts
import { describe, it, expect } from 'vitest'
import { formatMessage } from '@/lib/format'

describe('formatMessage', () => {
  it('renders markdown to sanitized HTML', () => {
    const html = formatMessage('**bold** *em*')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>em</em>')
  })

  it('strips script tags via DOMPurify', () => {
    const html = formatMessage('hi <script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('hi')
  })

  it('handles empty / nullish input', () => {
    expect(formatMessage('')).toBe('')
    // @ts-expect-error testing null tolerance
    expect(formatMessage(null)).toBe('')
  })
})
```

- [ ] **Step 9.2 — Run test, expect failure**

```bash
npm run test:run -- tests/lib/format.spec.ts
```
Expected: FAIL — `Cannot find module '@/lib/format'`.

- [ ] **Step 9.3 — Implement `src/lib/format.ts`**

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

export function formatMessage(text: string | null | undefined): string {
  if (!text) return ''
  const html = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(html)
}
```

- [ ] **Step 9.4 — Run test, expect pass**

```bash
npm run test:run -- tests/lib/format.spec.ts
```
Expected: 3 tests pass.

- [ ] **Step 9.5 — Commit**

```bash
git add src/lib/format.ts tests/lib/format.spec.ts
git commit -m "feat(m1): add formatMessage (marked + DOMPurify)"
```

---

## Task 10 — `lib/katex.ts` (thin wrapper, no tests — env-dependent)

**Files:**
- Create: `src/lib/katex.ts`

- [ ] **Step 10.1 — Create `src/lib/katex.ts`**

```ts
import renderMathInElement from 'katex/contrib/auto-render'

/** Render any KaTeX-style math expressions inside the given element. */
export function renderMath(el: HTMLElement): void {
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    })
  } catch {
    // KaTeX failures are non-fatal; markdown still renders.
  }
}
```

- [ ] **Step 10.2 — Commit**

```bash
git add src/lib/katex.ts
git commit -m "feat(m1): add katex auto-render glue"
```

---

## Task 11 — `lib/llm/types.ts` + `lib/llm/promptBuilder.ts` (TDD)

**Files:**
- Create: `src/lib/llm/types.ts`, `src/lib/llm/promptBuilder.ts`
- Test: `tests/lib/promptBuilder.spec.ts`

- [ ] **Step 11.1 — Create `src/lib/llm/types.ts`** (interface only; no logic yet)

```ts
import type { ChatMessage, Provider } from '@/types/domain'

export interface BuildPayloadInput {
  provider: Provider
  model: string
  history: ChatMessage[]
  pdfText: string // empty string = no doc
}

export interface OpenRouterPayload {
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  stream: true
}

export interface GeminiPayload {
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
}

export type ApiPayload = OpenRouterPayload | GeminiPayload
```

- [ ] **Step 11.2 — Write failing test**

```ts
// tests/lib/promptBuilder.spec.ts
import { describe, it, expect } from 'vitest'
import { buildPayload, NOTEBOOK_IDENTITY } from '@/lib/llm/promptBuilder'
import type { ChatMessage } from '@/types/domain'

const history: ChatMessage[] = [
  { id: 1, role: 'user', text: 'Hi' },
  { id: 2, role: 'assistant', text: 'Hello' },
]

describe('buildPayload (openrouter)', () => {
  it('includes identity in system prompt', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '' })
    expect('messages' in p && p.messages[0].role === 'system').toBe(true)
    if ('messages' in p) expect(p.messages[0].content).toContain(NOTEBOOK_IDENTITY)
  })

  it('uses no-doc branch when pdfText is empty', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '' })
    if ('messages' in p) expect(p.messages[0].content).toMatch(/No PDF is currently loaded/i)
  })

  it('embeds doc text when provided', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '[Page 1]\nfoo' })
    if ('messages' in p) expect(p.messages[0].content).toContain('[Page 1]\nfoo')
  })

  it('truncates pdfText longer than 80,000 chars', () => {
    const big = 'x'.repeat(90_000)
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: big })
    if ('messages' in p) {
      expect(p.messages[0].content.length).toBeLessThan(90_000 + 1_000)
      expect(p.messages[0].content).toMatch(/document truncated/i)
    }
  })

  it('appends history with role mapping', () => {
    const p = buildPayload({ provider: 'openrouter', model: 'x/y', history, pdfText: '' })
    if ('messages' in p) {
      expect(p.messages[1]).toEqual({ role: 'user', content: 'Hi' })
      expect(p.messages[2]).toEqual({ role: 'assistant', content: 'Hello' })
      expect(p.stream).toBe(true)
    }
  })
})

describe('buildPayload (gemini)', () => {
  it('emits contents[] with user/model roles', () => {
    const p = buildPayload({ provider: 'gemini', model: 'gemini-2.5-flash', history, pdfText: 'doc' })
    if ('contents' in p) {
      expect(p.contents[0].role).toBe('user')
      expect(p.contents[0].parts[0].text).toContain('doc')
      expect(p.contents[1].role).toBe('model')
      // History after the system bootstrap
      expect(p.contents[2]).toEqual({ role: 'user', parts: [{ text: 'Hi' }] })
      expect(p.contents[3]).toEqual({ role: 'model', parts: [{ text: 'Hello' }] })
    }
  })
})
```

- [ ] **Step 11.3 — Run test, expect failure**

```bash
npm run test:run -- tests/lib/promptBuilder.spec.ts
```
Expected: FAIL — module not found.

- [ ] **Step 11.4 — Implement `src/lib/llm/promptBuilder.ts`**

```ts
import type { ApiPayload, BuildPayloadInput } from './types'

export const NOTEBOOK_IDENTITY =
  'You are "Notebook", an AI assistant built into a PDF reader app. ' +
  'Never claim to be made by OpenAI, GPT, or any other model. You are Notebook.'

const TRUNCATE_LIMIT = 80_000

function buildSystemPrompt(pdfText: string): string {
  if (!pdfText) {
    return `${NOTEBOOK_IDENTITY}\n\nNo PDF is currently loaded. Let the user know they can import a PDF to ask questions about it. You can still answer general questions. Use markdown formatting.`
  }
  const safeText =
    pdfText.length > TRUNCATE_LIMIT
      ? pdfText.slice(0, TRUNCATE_LIMIT) + '\n\n[...document truncated due to length...]'
      : pdfText
  return `${NOTEBOOK_IDENTITY}\n\nYou help users understand the PDF document they are reading. Here is the full document text:\n\n${safeText}\n\nAnswer questions based on this content. Use markdown formatting. If the answer is not in the document, say so clearly.`
}

export function buildPayload(input: BuildPayloadInput): ApiPayload {
  const systemPrompt = buildSystemPrompt(input.pdfText)

  if (input.provider === 'gemini') {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I will answer questions based on the provided document.' }] },
    ]
    for (const m of input.history) {
      contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })
    }
    return { contents }
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const m of input.history) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })
  }
  return { model: input.model, messages, stream: true }
}
```

- [ ] **Step 11.5 — Run tests, expect all pass**

```bash
npm run test:run -- tests/lib/promptBuilder.spec.ts
```
Expected: 6 tests pass.

- [ ] **Step 11.6 — Commit**

```bash
git add src/lib/llm/types.ts src/lib/llm/promptBuilder.ts tests/lib/promptBuilder.spec.ts
git commit -m "feat(m1): add llm prompt builder with both provider shapes"
```

---

## Task 12 — `lib/llm/streamParser.ts` (TDD)

**Files:**
- Create: `src/lib/llm/streamParser.ts`
- Test: `tests/lib/streamParser.spec.ts`

This module turns an SSE byte stream into a sequence of text deltas, supporting both OpenAI-compat and Gemini chunk shapes.

- [ ] **Step 12.1 — Write failing test**

```ts
// tests/lib/streamParser.spec.ts
import { describe, it, expect } from 'vitest'
import { extractDelta } from '@/lib/llm/streamParser'

describe('extractDelta (openrouter)', () => {
  it('returns choices[0].delta.content', () => {
    const json = { choices: [{ delta: { content: 'hi' } }] }
    expect(extractDelta(json, 'openrouter')).toBe('hi')
  })

  it('returns empty string when delta missing', () => {
    expect(extractDelta({ choices: [{}] }, 'openrouter')).toBe('')
    expect(extractDelta({}, 'openrouter')).toBe('')
  })
})

describe('extractDelta (gemini)', () => {
  it('returns candidates[0].content.parts[0].text', () => {
    const json = { candidates: [{ content: { parts: [{ text: 'yo' }] } }] }
    expect(extractDelta(json, 'gemini')).toBe('yo')
  })

  it('returns empty string when shape is missing', () => {
    expect(extractDelta({ candidates: [{}] }, 'gemini')).toBe('')
    expect(extractDelta({}, 'gemini')).toBe('')
  })
})

describe('parseSseBuffer', () => {
  it.todo('integration test runs in useChat tests')
})
```

- [ ] **Step 12.2 — Run, expect failure**

```bash
npm run test:run -- tests/lib/streamParser.spec.ts
```
Expected: FAIL — module not found.

- [ ] **Step 12.3 — Implement `src/lib/llm/streamParser.ts`**

```ts
import type { Provider } from '@/types/domain'

export function extractDelta(json: unknown, provider: Provider): string {
  if (provider === 'gemini') {
    const j = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }
  const j = json as { choices?: Array<{ delta?: { content?: string } }> }
  return j.choices?.[0]?.delta?.content ?? ''
}

export interface SseLine {
  raw: string
  data?: unknown
  done: boolean
}

/**
 * Stateful SSE line splitter. Pass in raw decoded text chunks; receive
 * fully-parsed data events. Holds the partial trailing line internally.
 */
export class SseReader {
  private buffer = ''

  feed(chunk: string): SseLine[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    const out: SseLine[] = []
    for (const raw of lines) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      if (trimmed === 'data: [DONE]') {
        out.push({ raw, done: true })
        continue
      }
      if (!trimmed.startsWith('data: ')) continue
      try {
        out.push({ raw, data: JSON.parse(trimmed.slice(6)), done: false })
      } catch {
        // malformed JSON chunk — ignore
      }
    }
    return out
  }
}
```

- [ ] **Step 12.4 — Run, expect pass**

```bash
npm run test:run -- tests/lib/streamParser.spec.ts
```
Expected: 4 tests pass, 1 todo.

- [ ] **Step 12.5 — Commit**

```bash
git add src/lib/llm/streamParser.ts tests/lib/streamParser.spec.ts
git commit -m "feat(m1): add SSE reader and provider delta extractor"
```

---

## Task 13 — `lib/llm/openrouter.ts` + `lib/llm/gemini.ts`

**Files:**
- Create: `src/lib/llm/openrouter.ts`, `src/lib/llm/gemini.ts`

Thin URL+headers builders. No tests — they're glorified config; tested indirectly via `useChat`.

- [ ] **Step 13.1 — Create `src/lib/llm/openrouter.ts`**

```ts
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}
```

- [ ] **Step 13.2 — Create `src/lib/llm/gemini.ts`**

```ts
export function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
}

export function geminiHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
```

- [ ] **Step 13.3 — Commit**

```bash
git add src/lib/llm/openrouter.ts src/lib/llm/gemini.ts
git commit -m "feat(m1): add openrouter and gemini endpoint helpers"
```

---

## Task 14 — `lib/pdf.ts` + tests

**Files:**
- Create: `src/lib/pdf.ts`
- Test: `tests/lib/pdf.spec.ts`, `tests/fixtures/sample.pdf`

- [ ] **Step 14.1 — Add the fixture PDF**

Use any small (<30 KB) PDF you already have, or generate one:

```bash
mkdir -p tests/fixtures
# macOS: create a minimal PDF via Pages / Preview / pandoc.
# Acceptable substitute: download a Lorem Ipsum sample PDF and trim to 2 pages.
# Manual: drop tests/fixtures/sample.pdf in place. Verify size:
ls -lh tests/fixtures/sample.pdf
```

If you have no PDF on hand, use this Node-only snippet (run once, then delete) to generate a 2-page PDF without extra deps:

```ts
// scripts/make-fixture.ts — TEMPORARY, delete after running once.
import { writeFileSync } from 'node:fs'
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Count 2/Kids[3 0 R 5 0 R]>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>endobj\n' +
  '4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 10 100 Td (Hello page one) Tj ET\nendstream\nendobj\n' +
  '5 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 6 0 R/Resources<<>>>>endobj\n' +
  '6 0 obj<</Length 44>>stream\nBT /F1 12 Tf 10 100 Td (Hello page two) Tj ET\nendstream\nendobj\n' +
  'xref\n0 7\n0000000000 65535 f \ntrailer<</Size 7/Root 1 0 R>>\nstartxref\n0\n%%EOF\n',
)
writeFileSync('tests/fixtures/sample.pdf', pdf)
```

> If the generated file doesn't open via PDF.js, ship a real 2-page PDF instead. PDF.js is strict; use Preview → File → Export to PDF on a small TextEdit doc as a reliable fallback.

- [ ] **Step 14.2 — Write failing test**

```ts
// tests/lib/pdf.spec.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractTextByPage, loadPdf } from '@/lib/pdf'

let data: ArrayBuffer

beforeAll(() => {
  const buf = readFileSync(resolve(__dirname, '../fixtures/sample.pdf'))
  data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

describe('pdf.ts', () => {
  it('loadPdf returns a PDFDocumentProxy with numPages > 0', async () => {
    const pdf = await loadPdf(data)
    expect(pdf.numPages).toBeGreaterThan(0)
  })

  it('extractTextByPage returns one entry per page with text', async () => {
    const pages = await extractTextByPage(data)
    expect(pages.length).toBeGreaterThan(0)
    expect(pages[0]).toHaveProperty('pageNumber', 1)
    expect(pages[0]).toHaveProperty('text')
  })
})
```

- [ ] **Step 14.3 — Run, expect failure**

```bash
npm run test:run -- tests/lib/pdf.spec.ts
```
Expected: FAIL — module not found.

- [ ] **Step 14.4 — Implement `src/lib/pdf.ts`**

```ts
import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this URL at build time to a hashed asset.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface PageText {
  pageNumber: number
  text: string
}

/** Load a PDF from raw bytes. Caller is responsible for keeping `data` alive. */
export async function loadPdf(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  // Slice to detach from any caller's buffer that might be transferred.
  return pdfjsLib.getDocument({ data: data.slice(0) }).promise
}

/** Extract per-page text. */
export async function extractTextByPage(data: ArrayBuffer): Promise<PageText[]> {
  const pdf = await loadPdf(data)
  const out: PageText[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
    if (text.trim()) out.push({ pageNumber: i, text })
  }
  return out
}

/** Render a single page onto a canvas at the given scale. */
export async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1.5,
): Promise<void> {
  const page = await pdf.getPage(pageNumber)
  const vp = page.getViewport({ scale })
  canvas.height = vp.height
  canvas.width = vp.width
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  await page.render({ canvasContext: ctx, viewport: vp }).promise
}
```

- [ ] **Step 14.5 — Update `tests/setup.ts` to mock the worker URL**

```ts
// Append to tests/setup.ts:
vi.mock('pdfjs-dist/build/pdf.worker.min.js?url', () => ({ default: 'mock-worker.js' }))
```

- [ ] **Step 14.6 — Run, expect pass**

```bash
npm run test:run -- tests/lib/pdf.spec.ts
```
Expected: 2 tests pass.

If PDF.js complains about workers under jsdom, switch the import in `src/lib/pdf.ts` to the legacy build (`import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'`) which runs without a Web Worker, or stub the worker in `tests/setup.ts`. See the PDF.js README for the current recommendation.

- [ ] **Step 14.7 — Commit**

```bash
git add src/lib/pdf.ts tests/lib/pdf.spec.ts tests/fixtures/sample.pdf tests/setup.ts
git commit -m "feat(m1): add pdf loader + per-page text extractor"
```

---

## Task 15 — `composables/useDarkMode.ts`

**Files:**
- Create: `src/composables/useDarkMode.ts`

- [ ] **Step 15.1 — Create the composable**

```ts
import { ref, watchEffect } from 'vue'

const KEY = 'dark_mode'
const isDark = ref<boolean>(localStorage.getItem(KEY) === 'true')

watchEffect(() => {
  localStorage.setItem(KEY, String(isDark.value))
  document.documentElement.classList.toggle('dark', isDark.value)
})

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
  }
  return { isDark, toggle }
}
```

- [ ] **Step 15.2 — Commit**

```bash
git add src/composables/useDarkMode.ts
git commit -m "feat(m1): add useDarkMode composable"
```

---

## Task 16 — `composables/useToasts.ts`

**Files:**
- Create: `src/composables/useToasts.ts`

- [ ] **Step 16.1 — Create the composable**

```ts
import { ref } from 'vue'
import type { Toast } from '@/types/domain'

const toasts = ref<Toast[]>([])

export function useToasts() {
  function show(message: string, type: Toast['type'] = 'error') {
    const id = Date.now() + Math.random()
    toasts.value.push({ id, message, type, leaving: false })
    setTimeout(() => {
      const t = toasts.value.find((x) => x.id === id)
      if (t) t.leaving = true
      setTimeout(() => {
        toasts.value = toasts.value.filter((x) => x.id !== id)
      }, 300)
    }, 3500)
  }
  return { toasts, show }
}
```

- [ ] **Step 16.2 — Commit**

```bash
git add src/composables/useToasts.ts
git commit -m "feat(m1): add useToasts composable"
```

---

## Task 17 — `composables/useSettings.ts` (TDD)

**Files:**
- Create: `src/composables/useSettings.ts`
- Test: `tests/composables/useSettings.spec.ts`

- [ ] **Step 17.1 — Write failing test**

```ts
// tests/composables/useSettings.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSettings } from '@/composables/useSettings'

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults provider to openrouter and empty key/model', () => {
    const s = useSettings()
    expect(s.provider.value).toBe('openrouter')
    expect(s.apiKey.value).toBe('')
    expect(s.model.value).toBe('')
  })

  it('reads existing localStorage values', () => {
    localStorage.setItem('provider', 'gemini')
    localStorage.setItem('api_key', 'sk-test')
    localStorage.setItem('model', 'gemini-2.5-flash')
    const s = useSettings()
    expect(s.provider.value).toBe('gemini')
    expect(s.apiKey.value).toBe('sk-test')
    expect(s.model.value).toBe('gemini-2.5-flash')
  })

  it('persists writes back to localStorage', async () => {
    const s = useSettings()
    s.apiKey.value = 'sk-new'
    s.provider.value = 'gemini'
    s.model.value = 'gemini-2.5-flash'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('api_key')).toBe('sk-new')
    expect(localStorage.getItem('provider')).toBe('gemini')
    expect(localStorage.getItem('model')).toBe('gemini-2.5-flash')
  })

  it('modelPlaceholder reflects provider', () => {
    const s = useSettings()
    s.provider.value = 'gemini'
    expect(s.modelPlaceholder.value).toMatch(/gemini-2\.5-flash/)
    s.provider.value = 'openrouter'
    expect(s.modelPlaceholder.value).toMatch(/google\/gemini/)
  })
})
```

> Because `useSettings` returns module-level singletons (matching the rest of the composables in M1), re-import semantics matter: write tests that mutate state then read it back through the same call.

- [ ] **Step 17.2 — Run, expect failure**

- [ ] **Step 17.3 — Implement `src/composables/useSettings.ts`**

```ts
import { ref, computed, watch } from 'vue'
import type { Provider } from '@/types/domain'

const provider = ref<Provider>((localStorage.getItem('provider') as Provider | null) ?? 'openrouter')
const apiKey = ref<string>(localStorage.getItem('api_key') ?? '')
const model = ref<string>(localStorage.getItem('model') ?? '')

watch(provider, (v) => localStorage.setItem('provider', v))
watch(apiKey, (v) => localStorage.setItem('api_key', v))
watch(model, (v) => localStorage.setItem('model', v))

const modelPlaceholder = computed(() =>
  provider.value === 'gemini' ? 'e.g. gemini-2.5-flash' : 'e.g. google/gemini-2.5-flash',
)

const modelHint = computed(() =>
  provider.value === 'gemini' ? 'Uses Gemini API directly' : 'Any model from openrouter.ai/models',
)

export function useSettings() {
  return { provider, apiKey, model, modelPlaceholder, modelHint }
}
```

- [ ] **Step 17.4 — Run, expect pass**

- [ ] **Step 17.5 — Commit**

```bash
git add src/composables/useSettings.ts tests/composables/useSettings.spec.ts
git commit -m "feat(m1): add useSettings (localStorage-backed)"
```

---

## Task 18 — `composables/usePdfViewer.ts`

**Files:**
- Create: `src/composables/usePdfViewer.ts`

- [ ] **Step 18.1 — Create the composable**

```ts
import { ref, shallowRef } from 'vue'
import type * as pdfjsLib from 'pdfjs-dist'
import { loadPdf, renderPage } from '@/lib/pdf'

const currentPdf = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
const currentPage = ref(1)
const numPages = ref(0)
let canvas: HTMLCanvasElement | null = null

async function setActive(data: ArrayBuffer | null): Promise<void> {
  if (!data) {
    currentPdf.value = null
    numPages.value = 0
    return
  }
  const pdf = await loadPdf(data)
  currentPdf.value = pdf
  numPages.value = pdf.numPages
  currentPage.value = 1
  await drawCurrent()
}

function bindCanvas(el: HTMLCanvasElement | null) {
  canvas = el
}

async function drawCurrent() {
  if (!currentPdf.value || !canvas) return
  await renderPage(currentPdf.value, currentPage.value, canvas)
}

async function goTo(page: number) {
  if (!currentPdf.value) return
  if (page < 1 || page > numPages.value) return
  currentPage.value = page
  await drawCurrent()
}

function prev() { void goTo(currentPage.value - 1) }
function next() { void goTo(currentPage.value + 1) }

export function usePdfViewer() {
  return { currentPdf, currentPage, numPages, setActive, bindCanvas, drawCurrent, prev, next, goTo }
}
```

- [ ] **Step 18.2 — Commit**

```bash
git add src/composables/usePdfViewer.ts
git commit -m "feat(m1): add usePdfViewer composable"
```

---

## Task 19 — `composables/useDocuments.ts`

**Files:**
- Create: `src/composables/useDocuments.ts`

- [ ] **Step 19.1 — Create the composable**

```ts
import { ref, computed, watch } from 'vue'
import type { PdfDocument } from '@/types/domain'
import { loadPdf } from '@/lib/pdf'
import { usePdfViewer } from './usePdfViewer'

const documents = ref<PdfDocument[]>([])
const activeId = ref<number | null>(null)
let nextId = 1

const activeDoc = computed(() => documents.value.find((d) => d.id === activeId.value) ?? null)

const { setActive } = usePdfViewer()

watch(activeId, async (id) => {
  if (id == null) {
    await setActive(null)
    return
  }
  const doc = documents.value.find((d) => d.id === id)
  if (doc) await setActive(doc.data)
})

async function importFiles(files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    const buffer = await file.arrayBuffer()
    const pdf = await loadPdf(buffer)
    const id = nextId++
    documents.value.push({ id, name: file.name, data: buffer, numPages: pdf.numPages })
    if (activeId.value == null) activeId.value = id
  }
}

function select(id: number) {
  activeId.value = id
}

export function useDocuments() {
  return { documents, activeId, activeDoc, importFiles, select }
}
```

- [ ] **Step 19.2 — Commit**

```bash
git add src/composables/useDocuments.ts
git commit -m "feat(m1): add useDocuments composable (in-memory)"
```

---

## Task 20 — `composables/useChat.ts` (TDD with mocked fetch)

**Files:**
- Create: `src/composables/useChat.ts`
- Test: `tests/composables/useChat.spec.ts`

- [ ] **Step 20.1 — Write failing test**

```ts
// tests/composables/useChat.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

describe('useChat', () => {
  beforeEach(() => {
    localStorage.clear()
    const s = useSettings()
    s.apiKey.value = 'sk-test'
    s.provider.value = 'openrouter'
    s.model.value = 'x/y'
    const chat = useChat()
    chat.clear()
  })

  it('pushes user message and assistant message in order', async () => {
    const body = makeSseStream([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    )

    const chat = useChat()
    await chat.send('hello', '')
    expect(chat.messages.value.map((m) => [m.role, m.text])).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hi there'],
    ])
  })

  it('surfaces an error message when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'bad key' } }), {
            status: 401,
          }),
      ),
    )
    const chat = useChat()
    await chat.send('hi', '')
    const last = chat.messages.value.at(-1)!
    expect(last.role).toBe('assistant')
    expect(last.error).toBe(true)
    expect(last.text).toMatch(/bad key/)
  })

  it('refuses to send without an api key', async () => {
    const s = useSettings()
    s.apiKey.value = ''
    const chat = useChat()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await chat.send('hi', '')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(chat.messages.value.length).toBe(1) // user message only
  })
})
```

- [ ] **Step 20.2 — Run, expect failure**

- [ ] **Step 20.3 — Implement `src/composables/useChat.ts`**

```ts
import { ref } from 'vue'
import type { ChatMessage } from '@/types/domain'
import { buildPayload } from '@/lib/llm/promptBuilder'
import { OPENROUTER_URL, openRouterHeaders } from '@/lib/llm/openrouter'
import { geminiUrl, geminiHeaders } from '@/lib/llm/gemini'
import { SseReader, extractDelta } from '@/lib/llm/streamParser'
import { useSettings } from './useSettings'
import { useToasts } from './useToasts'

const messages = ref<ChatMessage[]>([])
const isTyping = ref(false)
let nextId = 1

const { provider, apiKey, model } = useSettings()
const { show } = useToasts()

async function send(text: string, pdfText: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || isTyping.value) return

  messages.value.push({ id: nextId++, role: 'user', text: trimmed })

  if (!apiKey.value) {
    show('Please add an API key to get AI responses', 'error')
    return
  }

  isTyping.value = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  let assistant: ChatMessage | null = null

  try {
    const history = messages.value.filter((m) => !m.error)
    const payload = buildPayload({
      provider: provider.value,
      model: model.value || (provider.value === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.5-flash'),
      history,
      pdfText,
    })

    const isGemini = provider.value === 'gemini'
    const url = isGemini
      ? geminiUrl(model.value || 'gemini-2.5-flash', apiKey.value)
      : OPENROUTER_URL
    const headers = isGemini ? geminiHeaders() : openRouterHeaders(apiKey.value)

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      let msg = `API error (${res.status})`
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string }
        msg = parsed.error?.message ?? parsed.message ?? msg
      } catch {
        // body wasn't JSON
      }
      throw new Error(msg)
    }

    assistant = { id: nextId++, role: 'assistant', text: '' }
    messages.value.push(assistant)
    isTyping.value = false

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const sse = new SseReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const event of sse.feed(chunk)) {
        if (event.done) continue
        const delta = extractDelta(event.data, provider.value)
        if (delta) assistant.text += delta
      }
    }

    assistant.text = assistant.text
      .replace(/\n*(User|Response)\s*Safety\s*:\s*\w+/gi, '')
      .trimEnd()

    if (!assistant.text) {
      assistant.text = 'I received an empty response. Please try again.'
      assistant.error = true
    }
  } catch (err) {
    isTyping.value = false
    const e = err as Error
    const errText =
      e.name === 'AbortError'
        ? 'Request timed out. The PDF may be too large or the API is slow.'
        : e.message
    if (!assistant) {
      messages.value.push({ id: nextId++, role: 'assistant', text: `**Error:** ${errText}`, error: true })
    } else if (!assistant.text) {
      assistant.text = `**Error:** ${errText}`
      assistant.error = true
    }
    show(errText, 'error')
  } finally {
    clearTimeout(timeout)
    isTyping.value = false
  }
}

function clear(): void {
  messages.value = []
  show('Chat cleared', 'success')
}

export function useChat() {
  return { messages, isTyping, send, clear }
}
```

- [ ] **Step 20.4 — Run, expect pass**

- [ ] **Step 20.5 — Commit**

```bash
git add src/composables/useChat.ts tests/composables/useChat.spec.ts
git commit -m "feat(m1): add useChat with streaming + error paths"
```

---

## Task 21 — Build presentational components (no tests)

Each component below is a port from the corresponding section of the **original** `index.html` (preserve in your local working copy or recover from commit `5bd57eb`). Behavior must match exactly.

**Files:** all under `src/components/` — see paths in each step.

- [ ] **Step 21.1 — `src/components/ui/Toast.vue`**

```vue
<script setup lang="ts">
import { useToasts } from '@/composables/useToasts'
const { toasts } = useToasts()
</script>

<template>
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="[
        'pointer-events-auto px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2',
        t.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white',
        t.leaving ? 'toast-exit' : 'toast-enter',
      ]"
    >
      <i :class="['fa-solid', t.type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check']"></i>
      {{ t.message }}
    </div>
  </div>
</template>
```

- [ ] **Step 21.2 — `src/components/chat/TypingIndicator.vue`**

```vue
<template>
  <div class="flex justify-start gap-2.5 msg-enter">
    <div class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
      <i class="fa-solid fa-robot text-[10px] text-zinc-500 dark:text-zinc-400"></i>
    </div>
    <div class="px-4 py-3 rounded-2xl rounded-bl-md bg-zinc-100 dark:bg-zinc-800 flex items-center gap-1.5">
      <span class="typing-dot w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 inline-block"></span>
      <span class="typing-dot w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 inline-block"></span>
      <span class="typing-dot w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 inline-block"></span>
    </div>
  </div>
</template>
```

- [ ] **Step 21.3 — `src/components/chat/ChatMessage.vue`**

```vue
<script setup lang="ts">
import { onMounted, onUpdated, ref } from 'vue'
import type { ChatMessage as Msg } from '@/types/domain'
import { formatMessage } from '@/lib/format'
import { renderMath } from '@/lib/katex'

const props = defineProps<{ msg: Msg }>()
const root = ref<HTMLElement | null>(null)

function paint() {
  if (root.value) renderMath(root.value)
}
onMounted(paint)
onUpdated(paint)
</script>

<template>
  <div class="msg-enter">
    <div v-if="props.msg.role === 'user'" class="flex justify-end">
      <div class="user-msg-prose max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white text-sm shadow-sm">
        <div ref="root" v-html="formatMessage(props.msg.text)"></div>
      </div>
    </div>
    <div v-else class="flex justify-start gap-2.5">
      <div class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
        <i class="fa-solid fa-robot text-[10px] text-zinc-500 dark:text-zinc-400"></i>
      </div>
      <div class="max-w-[85%]">
        <div class="px-4 py-2.5 rounded-2xl rounded-bl-md bg-zinc-100 dark:bg-zinc-800 text-sm prose dark:prose-invert prose-sm max-w-none">
          <div ref="root" v-html="formatMessage(props.msg.text)"></div>
        </div>
        <div v-if="props.msg.error" class="flex items-center gap-1 mt-1 ml-1">
          <i class="fa-solid fa-circle-exclamation text-[10px] text-red-400"></i>
          <span class="text-[10px] text-red-400">Failed to get response</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

> **Note:** `v-html` is safe here because `formatMessage` already runs DOMPurify. ESLint may warn; suppress per-line with a comment if needed.

- [ ] **Step 21.4 — `src/components/chat/ChatInput.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ disabled: boolean; placeholder?: string }>()
const emit = defineEmits<{ send: [text: string] }>()

const value = ref('')

function submit() {
  const text = value.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  value.value = ''
}
</script>

<template>
  <form @submit.prevent="submit" class="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    <div class="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1 focus-within:ring-2 focus-within:ring-indigo-400/50 transition">
      <input
        v-model="value"
        type="text"
        :disabled="props.disabled"
        :placeholder="props.placeholder ?? 'Ask anything about the doc…'"
        class="flex-1 py-2.5 bg-transparent border-0 outline-none text-sm placeholder-zinc-400"
      />
      <button
        type="submit"
        :disabled="!value.trim() || props.disabled"
        :class="[
          'p-2 rounded-lg transition-all duration-200',
          value.trim() && !props.disabled
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm scale-100'
            : 'text-zinc-300 dark:text-zinc-600 scale-95 cursor-not-allowed',
        ]"
      >
        <i class="fa-solid fa-paper-plane text-xs"></i>
      </button>
    </div>
    <slot name="hint" />
  </form>
</template>
```

- [ ] **Step 21.5 — `src/components/AppSidebar.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useDarkMode } from '@/composables/useDarkMode'
import { useDocuments } from '@/composables/useDocuments'

const { isDark, toggle } = useDarkMode()
const { documents, activeId, importFiles, select } = useDocuments()

const fileInputRef = ref<HTMLInputElement | null>(null)

async function onPick(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) await importFiles(target.files)
  target.value = ''
}
</script>

<template>
  <aside class="w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-bold text-indigo-600 dark:text-indigo-400">Notebook</h1>
      <button
        class="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
        @click="toggle"
      >
        <i :class="['fa-solid', isDark ? 'fa-sun' : 'fa-moon']"></i>
      </button>
    </div>

    <button
      class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
      @click="fileInputRef?.click()"
    >
      Import PDF
    </button>
    <input ref="fileInputRef" type="file" multiple accept=".pdf" class="hidden" @change="onPick" />

    <div class="flex-1 overflow-y-auto space-y-2">
      <div
        v-for="doc in documents"
        :key="doc.id"
        :class="[
          'p-3 rounded-lg cursor-pointer text-sm truncate transition',
          activeId === doc.id
            ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
        ]"
        @click="select(doc.id)"
      >
        <i class="fa-solid fa-file-pdf mr-2"></i> {{ doc.name }}
      </div>
    </div>
  </aside>
</template>
```

> Re-order the import group above to match Prettier output (Prettier will fix it on save if you forget).

- [ ] **Step 21.6 — `src/components/PdfViewer.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDocuments } from '@/composables/useDocuments'
import { usePdfViewer } from '@/composables/usePdfViewer'

const { activeDoc } = useDocuments()
const { currentPage, numPages, bindCanvas, prev, next } = usePdfViewer()

const canvas = ref<HTMLCanvasElement | null>(null)
onMounted(() => bindCanvas(canvas.value))
</script>

<template>
  <main class="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
    <div v-if="activeDoc" class="h-full flex flex-col p-6 overflow-hidden">
      <div class="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex-1 flex flex-col overflow-hidden">
        <div class="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800">
          <span class="font-medium truncate text-sm">{{ activeDoc.name }}</span>
          <div class="flex items-center gap-3">
            <button class="px-2 py-1 bg-white dark:bg-zinc-900 border rounded hover:bg-zinc-100" @click="prev">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="text-xs">{{ currentPage }} / {{ numPages }}</span>
            <button class="px-2 py-1 bg-white dark:bg-zinc-900 border rounded hover:bg-zinc-100" @click="next">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4 flex justify-center bg-zinc-100 dark:bg-zinc-950">
          <canvas ref="canvas" class="shadow-lg max-w-full h-auto"></canvas>
        </div>
      </div>
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-zinc-400">Select a document to view</div>
  </main>
</template>
```

- [ ] **Step 21.7 — `src/components/ChatPanel.vue`**

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ChatMessage from './chat/ChatMessage.vue'
import ChatInput from './chat/ChatInput.vue'
import TypingIndicator from './chat/TypingIndicator.vue'
import { useChat } from '@/composables/useChat'
import { useSettings } from '@/composables/useSettings'
import { usePdfViewer } from '@/composables/usePdfViewer'
import { extractTextByPage } from '@/lib/pdf'
import { useDocuments } from '@/composables/useDocuments'

const { messages, isTyping, send, clear } = useChat()
const { provider, apiKey, model, modelPlaceholder, modelHint } = useSettings()
const { activeDoc } = useDocuments()
usePdfViewer() // ensure singleton lives in this tree

const showSettings = ref(false)
const showApiKey = ref(false)
const chatContainer = ref<HTMLElement | null>(null)

const isReady = computed(() => !!apiKey.value)

function scrollToBottom() {
  void nextTick(() => {
    const el = chatContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch([messages, isTyping], scrollToBottom, { deep: true })

async function onSend(text: string) {
  const pdfText = activeDoc.value
    ? (await extractTextByPage(activeDoc.value.data))
        .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
        .join('\n\n')
    : ''
  await send(text, pdfText)
}
</script>

<template>
  <section class="w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-comments text-indigo-500"></i>
        <span class="font-semibold text-sm">Chat</span>
        <span v-if="isReady" class="flex items-center gap-1 text-[10px] text-emerald-500 font-medium ml-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block"></span>Ready
        </span>
        <span v-else class="flex items-center gap-1 text-[10px] text-zinc-400 font-medium ml-1">
          <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 inline-block"></span>No key
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          title="Clear chat"
          @click="clear"
        >
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
        <button
          :class="[
            'p-2 rounded-lg transition',
            showSettings
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
          ]"
          title="Settings"
          @click="showSettings = !showSettings"
        >
          <i class="fa-solid fa-gear text-xs"></i>
        </button>
      </div>
    </div>

    <!-- Settings drawer -->
    <div :class="['settings-panel px-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50', { open: showSettings }]">
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Provider</label>
          <div class="flex gap-2">
            <button
              :class="[
                'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition',
                provider === 'openrouter'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]"
              @click="provider = 'openrouter'"
            >
              OpenRouter
            </button>
            <button
              :class="[
                'flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition',
                provider === 'gemini'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700',
              ]"
              @click="provider = 'gemini'"
            >
              Gemini
            </button>
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">API Key</label>
          <div class="relative">
            <input
              v-model="apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="Enter your API key…"
              class="w-full p-2.5 pr-9 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition"
            />
            <button
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              @click="showApiKey = !showApiKey"
            >
              <i :class="['fa-solid text-xs', showApiKey ? 'fa-eye-slash' : 'fa-eye']"></i>
            </button>
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Model</label>
          <input
            v-model="model"
            :placeholder="modelPlaceholder"
            class="w-full p-2.5 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition"
          />
          <p class="text-[10px] text-zinc-400 mt-1">{{ modelHint }}</p>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div id="chat-container" ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
      <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-center px-6">
        <div class="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4">
          <i class="fa-solid fa-robot text-indigo-500 text-xl"></i>
        </div>
        <p class="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">Ask me anything</p>
        <p class="text-xs text-zinc-400">Import a PDF and ask questions about its content</p>
      </div>
      <ChatMessage v-for="m in messages" :key="m.id" :msg="m" />
      <TypingIndicator v-if="isTyping" />
    </div>

    <!-- Input -->
    <ChatInput :disabled="isTyping" @send="onSend">
      <template #hint>
        <p v-if="!isReady" class="text-[10px] text-amber-500 mt-2 flex items-center gap-1 px-1">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Add an API key in settings to enable AI responses
        </p>
      </template>
    </ChatInput>
  </section>
</template>
```

- [ ] **Step 21.8 — Commit components**

```bash
git add src/components
git commit -m "feat(m1): port presentational components from index.html"
```

---

## Task 22 — Wire `App.vue` + `main.ts`

**Files:**
- Create: `src/App.vue`, `src/main.ts`

- [ ] **Step 22.1 — Create `src/App.vue`**

```vue
<script setup lang="ts">
import AppSidebar from './components/AppSidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import ChatPanel from './components/ChatPanel.vue'
import Toast from './components/ui/Toast.vue'
</script>

<template>
  <div class="h-full flex overflow-hidden relative">
    <AppSidebar />
    <PdfViewer />
    <ChatPanel />
    <Toast />
  </div>
</template>
```

- [ ] **Step 22.2 — Create `src/main.ts`**

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

createApp(App).mount('#app')
```

- [ ] **Step 22.3 — Run dev server, do a sanity check**

```bash
npm run dev
```
Open the URL Vite prints. Expect:
- Sidebar visible with "Notebook" title + dark-mode toggle + "Import PDF" button.
- Center pane shows "Select a document to view".
- Right pane shows chat empty state with "No key" indicator.

Close dev server (Ctrl-C).

- [ ] **Step 22.4 — Commit**

```bash
git add src/App.vue src/main.ts
git commit -m "feat(m1): mount app shell"
```

---

## Task 23 — Full typecheck + lint + tests pass

- [ ] **Step 23.1 — Typecheck**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 23.2 — Lint**

```bash
npm run lint
```
Expected: exit 0 (warnings OK; errors not OK). Fix any errors inline.

- [ ] **Step 23.3 — All tests**

```bash
npm run test:run
```
Expected: every spec passes. Failing tests must be fixed before continuing.

- [ ] **Step 23.4 — Build**

```bash
npm run build
```
Expected: `dist/` produced, no errors.

- [ ] **Step 23.5 — Commit any fixups**

```bash
git status
git add -A
git diff --cached --stat
git commit -m "chore(m1): fixups for typecheck/lint/build" --allow-empty
```

---

## Task 24 — Manual parity check against original behavior

> The original `index.html` is no longer on disk after Task 4; if you need to compare visually, `git show 5bd57eb:index.html > /tmp/old.html` and open that in a browser.

- [ ] **Step 24.1 — Run dev server**

```bash
npm run dev
```

- [ ] **Step 24.2 — Walk the checklist** (each item must behave the same as the old app):

  - [ ] Dark mode toggles via top-right button; persists across reload.
  - [ ] "Import PDF" opens a file picker; choosing a PDF adds it to the sidebar list.
  - [ ] First imported PDF becomes the active doc automatically.
  - [ ] Clicking another doc in the sidebar switches the viewer.
  - [ ] Page indicator shows `1 / N`; ←/→ buttons change pages.
  - [ ] Chat shows empty state with the robot icon until a message is sent.
  - [ ] Without an API key, settings panel auto-prompts: clicking send shows a toast and does not call the API. The status pill says "No key".
  - [ ] After pasting a key in settings, the status pill flips to "Ready".
  - [ ] Sending a question with an active PDF streams an answer (verify with a real key).
  - [ ] Sending a question with no PDF streams a general response (verify with a real key).
  - [ ] Switching provider between OpenRouter and Gemini updates the model placeholder hint.
  - [ ] Markdown + KaTeX rendering works on assistant replies.
  - [ ] "Clear chat" trash icon empties the message list and shows a success toast.
  - [ ] Network/HTTP errors show an error message in chat + a toast.
  - [ ] localStorage settings written by the new app are readable by the old monolith (`api_key`, `provider`, `model`, `dark_mode` keys).

- [ ] **Step 24.3 — Note any parity gaps** in `docs/superpowers/specs/2026-06-27-notebook-m1-m3-design.md` under §17 risks; fix small gaps inline before moving on.

- [ ] **Step 24.4 — Stop dev server, commit any fixes**

```bash
git status
git add -A
git commit -m "fix(m1): parity-check followups" --allow-empty
```

---

## Task 25 — Tag M1 ship

- [ ] **Step 25.1 — Tag the commit**

```bash
git tag -a m1-foundation -m "M1: foundation refactor — behavior parity ship"
```

- [ ] **Step 25.2 — Print final status**

```bash
git log --oneline
git tag --list
echo "--- M1 complete. Next: M2 (persistence + multi-doc threads)."
```

---

## Definition of Done

- `npm run dev` opens the app at `localhost:5173` and behaves identically to the original `index.html` per Task 24's checklist.
- `npm run build` produces a static `dist/` deployable to any static host.
- `npm run test:run` passes with at least the specs listed in §14 of the design spec that pertain to M1 modules (`format`, `streamParser`, `promptBuilder`, `pdf`, `useSettings`, `useChat`).
- `npm run typecheck` passes.
- `npm run lint` passes with no errors.
- Git history shows small, descriptive commits (one per Task) and a `m1-foundation` tag at the end.

When all of the above are true, **M1 is done**. Write the M2 plan next.
