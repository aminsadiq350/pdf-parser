# Group H — PWA + Offline Shell

## Problem

The app is a SPA that reloads from network every time. There is no
manifest, no service worker, no install affordance, no icons. A user
who imported docs yesterday still needs network to open the app today.
On a flaky connection, the chat UI is unreachable even though all the
docs/threads/messages are already in IndexedDB.

We want:

- The app shell loads offline after the first visit.
- Existing docs (rendering, text extraction, in-doc search, chat history
  scroll-back) work without network.
- A clear "Install Notebook" affordance when the browser supports it.
- Update flow that doesn't surprise a user mid-conversation.

The only thing that legitimately requires network is the LLM call
itself. `useChat.send` already fails gracefully when fetch errors out.

## Goals

1. Installable PWA: passes Chrome's installability criteria (manifest +
   served-over-HTTPS-or-localhost + SW + icons).
2. App shell (HTML + JS + CSS + font assets) + PDF.js worker + standard
   fonts pre-cached on first install so PDF rendering works offline.
3. Tesseract CDN assets runtime-cached so repeat OCR works offline
   after first network use.
4. Install icon next to the dark-mode toggle in the sidebar header,
   visible only when `beforeinstallprompt` fires.
5. Update flow surfaces an "Update available · Reload" toast when a new
   SW activates; never forces a reload.
6. Zero impact on tests: tests run in jsdom where SW APIs don't exist;
   the registration code must be a no-op when `serviceWorker` is
   missing.

## Non-goals

- Background sync / push notifications.
- Pre-caching Tesseract's traineddata (~10MB) — too heavy for default
  install; runtime cache only.
- iOS Safari "Add to Home Screen" tutorial UX — the manifest + apple
  icons are enough.
- Splash screens / launch images.
- Offline LLM calls (out of scope by design — the LLM is the network
  dependency).

## Solution

### Manifest

`vite-plugin-pwa` generates `manifest.webmanifest` from the config:

```ts
manifest: {
  name: 'Notebook',
  short_name: 'Notebook',
  description: 'Read PDFs, chat with their contents, fully on-device.',
  theme_color: '#4f46e5',     // indigo-600
  background_color: '#ffffff',
  display: 'standalone',
  scope: '/',
  start_url: '/',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: '/icons/icon-512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}
```

### Icons

Hand-authored SVG (`public/icons/source.svg`) — solid indigo
background, white sans-serif "N", subtle book-spine motif. Rendered to
PNG via a one-off script using `sharp` (devDependency only; not in
production bundle):

- `icon-192.png` (192×192 — Android install)
- `icon-512.png` (512×512 — splash, install dialog)
- `icon-512-maskable.png` (with 10% safe-zone padding for adaptive
  icons on Android)

A `favicon.svg` referenced from `index.html` covers desktop tabs.

### Service Worker (auto via `vite-plugin-pwa`)

Workbox config:

- `registerType: 'prompt'` — new SW waits for user opt-in instead of
  auto-claiming clients.
- `workbox.globPatterns: ['**/*.{js,css,html,woff2,ttf,json,svg,png}']`
  — pre-caches the app shell + icons + KaTeX fonts + Font Awesome.
- `workbox.maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` so we also
  precache the 1MB PDF.js worker bundle.
- Runtime caching:
  - `urlPattern: /\/standard-fonts\//` → `CacheFirst` (PDF.js standard
    fonts).
  - `urlPattern: /unpkg\.com\/tesseract/i` → `CacheFirst` with 30-day
    expiration (Tesseract WASM core + traineddata).

### Install affordance

`src/composables/useInstallPrompt.ts` (singleton):

```ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredEvent = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(window.matchMedia('(display-mode: standalone)').matches)
const canInstall = computed(() => !!deferredEvent.value && !installed.value)

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredEvent.value = e as BeforeInstallPromptEvent
})
window.addEventListener('appinstalled', () => {
  deferredEvent.value = null
  installed.value = true
})

async function install() { ... }
```

`AppSidebar.vue` renders an indigo download button next to the
dark-mode toggle, `v-if="canInstall"`.

### Update flow

`vite-plugin-pwa`'s `virtual:pwa-register/vue` exposes a `useRegisterSW`
that fires `onNeedRefresh` when a new SW is waiting. We register in
`main.ts`:

```ts
import { useRegisterSW } from 'virtual:pwa-register/vue'

if ('serviceWorker' in navigator) {
  const { needRefresh, updateServiceWorker } = useRegisterSW()
  watch(needRefresh, (v) => {
    if (v) {
      toasts.show('Update available · Reload', 'info', 10_000)
      // Wire a one-time click handler — keep it simple: a toast action
      // would be nicer but we don't have toast actions yet. For v1 the
      // user clicks the toast itself to reload via a dedicated action
      // mounted in <Toast />.
    }
  })
}
```

Concretely, since the existing `<Toast />` has no action surface, the
update flow exposes a function `triggerUpdate()` on a separate
composable and `Toast.vue` renders a "Reload" button when a toast has
`{ kind: 'update' }`. Cleanest: extend `Toast` with an optional
`action: { label, handler }` field.

### Test strategy

- Unit specs for `useInstallPrompt`:
  - `canInstall` is false initially.
  - After a `beforeinstallprompt` event, `canInstall` becomes true.
  - `install()` calls `prompt()` and clears the deferred event on
    'accepted'.
- Smoke spec for the manifest existing in `dist/` after build.
- SW registration code must be guarded with `if ('serviceWorker' in
  navigator)` so jsdom tests don't try to register.
- Component: install button hidden when `canInstall` is false; visible
  + click invokes `install()` when true.

E2E (manual via Playwright):
- Build, serve `dist/` over `npx serve` on port 5050.
- Open Chrome DevTools → Application → Manifest: shows Notebook icon,
  short_name, theme color.
- Application → Service Workers: SW activated.
- Network → Offline → reload → app loads, sidebar/viewer/chat render.

## Risks

- **vite-plugin-pwa default precache catches too much** — Tesseract
  bundle is heavy; we exclude it from glob and rely on lazy loading.
- **HMR dev mode + SW interact poorly** — disable SW in dev via
  `devOptions: { enabled: false }`.
- **iOS Safari** — `display: standalone` works, `beforeinstallprompt`
  does not. Install button is hidden on iOS; users use Safari's "Add
  to Home Screen" manually. Acceptable for v1.
- **Test environment** — vitest with jsdom doesn't define
  `serviceWorker`. Guard every reference. The
  `virtual:pwa-register/vue` import is only used in `main.ts` and never
  in tests.

## Out-of-scope follow-ups

- Background sync of LLM responses queued offline.
- Push notifications (e.g. "import finished").
- Per-doc share-target API (drag a PDF to the launcher icon).
- iOS Safari install tutorial overlay.
