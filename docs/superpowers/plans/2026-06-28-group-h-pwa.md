# Plan — Group H PWA + Offline Shell

Spec: `2026-06-28-group-h-pwa.md`

Five tasks, continuous-run, verification gate at the end.

## Task 1 — Icons + manifest source

1. Hand-author `public/icons/source.svg` — solid indigo background
   (#4f46e5), white sans-serif `N` glyph centred, slight book-spine
   detail.
2. One-off Node script `scripts/build-icons.mjs` using `sharp`
   (devDependency) that emits:
   - `public/icons/icon-192.png`
   - `public/icons/icon-512.png`
   - `public/icons/icon-512-maskable.png` (10% padding)
   - `public/icons/favicon.svg` (copy of source.svg, slightly different
     viewBox / no padding)
3. Add `npm run icons` script that runs the generator. Don't run on
   every build — only when source.svg changes.
4. Reference `favicon.svg` from `index.html`.

**Commit:** `feat(h1): notebook icon set + manifest icons source`

## Task 2 — Install vite-plugin-pwa + configure manifest + Workbox

1. `npm install -D vite-plugin-pwa workbox-window`.
2. Update `vite.config.ts` to register `VitePWA` with the manifest,
   globPatterns, runtime caching, devOptions disabled.
3. Manifest exposes the icons from Task 1.
4. Confirm the SW & manifest are emitted into `dist/` on build.

**Commit:** `feat(h2): vite-plugin-pwa + manifest + Workbox runtime caching`

## Task 3 — `useInstallPrompt` composable + sidebar install button

1. `src/composables/useInstallPrompt.ts` capturing
   `beforeinstallprompt` + `appinstalled`.
2. Tests for `canInstall` state transitions + `install()` clearing the
   deferred event.
3. Sidebar header gains a `v-if="canInstall"` install button next to
   the dark-mode toggle. Click → `install()`.

**Commit:** `feat(h3): install-prompt composable + sidebar install button`

## Task 4 — Update flow: `useRegisterSW` + actionable toast

1. Extend `Toast` type with optional `action: { label, handler }`.
2. Update `<Toast />` to render the action button when present.
3. `useToasts.show` overload (or new method) for toasts with actions.
4. `src/main.ts` registers the SW via `virtual:pwa-register/vue` and on
   `onNeedRefresh` posts a `{ message: 'Update available', action: {
   label: 'Reload', handler: updateSW } }` toast that lives until the
   user acts (no auto-dismiss).
5. Guard SW registration with `if ('serviceWorker' in navigator)` so
   tests don't break.

**Commit:** `feat(h4): SW update prompt via actionable toast`

## Task 5 — Verification + tag

1. `npm run typecheck && npm run lint && npm run test:run && npm run
   build`.
2. Inspect `dist/`: confirm `manifest.webmanifest` + `sw.js` +
   `workbox-*.js` + icon PNGs present.
3. Live verify via Playwright:
   - `npx serve dist -p 5050 --no-clipboard --single`.
   - Navigate to `http://localhost:5050/`.
   - DevTools `Application` panel: manifest shows Notebook + icons; SW
     activated; storage in IndexedDB intact.
   - DevTools Network → Offline; reload — app shell renders, sidebar +
     viewer + chat all functional minus the LLM call.
4. `git tag -a group-h-pwa -m "..."`.

**Commit:** none.

## Pacing

Continuous. Surface real bugs as `fix(hN): …` before the tag.
