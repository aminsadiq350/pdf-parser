# Group D — Mobile / Responsive Layout

## Problem

The current shell is a fixed 3-pane flex layout:

- `AppSidebar` — `w-72` (288 px)
- `PdfViewer` — `flex-1`
- `ChatPanel` — `w-96` (384 px)

Below ~900 px viewport the chat panel crowds out the viewer; below ~700 px
the sidebar+chat consume more horizontal space than the viewport. On phones
the app is unusable. We need a responsive shell that:

- Stays pixel-identical at `md+` (≥ 768 px).
- Folds the two side panes into overlays below `md`, with the viewer as the
  always-visible canvas underneath.
- Adapts the chat overlay shape to device class:
  - **Tablet / narrow desktop** (`sm` ≤ x < `md`, 640–767 px): right-slide
    drawer.
  - **Phone** (`< sm`, ≤ 639 px): bottom sheet (full width, ~85 vh tall).
- Keeps the sidebar as a left-slide drawer at every width below `md` (a
  bottom sheet doesn't fit a list picker).
- Does not regress any existing desktop behaviour.

## Goals

1. Pass on real mobile widths (375 × 667, 414 × 896, 768 × 1024) — all three
   panes reachable, nothing clipped.
2. Touch-friendly: 44 × 44 minimum tap targets on the mobile chrome.
3. iOS safe-area aware (`env(safe-area-inset-*)`) so notch/home-indicator
   don't eat controls.
4. ESC closes the open drawer; backdrop tap closes; selecting a doc or
   thread auto-closes; clicking a citation chip auto-closes (user lands on
   viewer with the cited page drawn).
5. Body scroll is locked while a drawer is open.

## Non-goals

- No drag-to-dismiss gesture on the bottom sheet (v1 uses tap-backdrop and
  close button only).
- No persistence of drawer-open state across reloads — always start closed.
- No tablet-specific 3-pane reshuffling — `md+` keeps the desktop layout
  unchanged.
- No bottom-tab navigation pattern — drawers preserve the desktop spatial
  model (left=docs, right/bottom=chat).
- No native app shell / `display-mode: standalone` tweaks — that lives in
  Group H (PWA).

## Solution

### Breakpoint contract

| Range | Layout | Sidebar | Chat |
|---|---|---|---|
| `< sm` (≤ 639 px) | viewer fills, mobile bar visible | left drawer (`w-[85vw] max-w-[20rem]`) | bottom sheet (`h-[85vh] w-full`) |
| `sm`–`md` (640–767 px) | viewer fills, mobile bar visible | left drawer | right drawer (`w-[24rem] max-w-[85vw]`) |
| `≥ md` (768 px+) | original 3-pane flex | static in-flow | static in-flow |

### New composables

- **`useResponsive`** — exposes reactive `isMobile` (`window.innerWidth < 768`)
  and `isPhone` (`< 640`). Uses `matchMedia` with `addEventListener('change',
  …)`; cleans up on unmount. Singleton module-state pattern matching the rest
  of the codebase.
- **`useDrawers`** — singleton store with `{ left: bool, right: bool }`,
  `openLeft`, `openRight`, `closeAll`, `toggleLeft`, `toggleRight`. Opening
  one auto-closes the other (only one drawer visible at a time). Includes a
  `bodyScrollLocked` computed for `<body>` overflow toggling.

### New components

- **`MobileChromeBar.vue`** — `md:hidden` top bar with hamburger | active
  doc name (truncated) | chat bubble. Used in `App.vue`.
- **`DrawerBackdrop.vue`** — `fixed inset-0 bg-black/40 z-30` with
  click-to-close. Renders only when any drawer is open. Centralised so we
  don't duplicate the markup twice.

### Modified components

- **`App.vue`** — render `MobileChromeBar` (`md:hidden`) above the flex row;
  render `DrawerBackdrop` after the panes; wrap the flex in a column so the
  bar sits on top. Body class toggled via `useDrawers.bodyScrollLocked`.
- **`AppSidebar.vue`** — wrap `<aside>` in conditional classes:
  - Base: `w-72 bg-white dark:bg-zinc-900 border-r ...`
  - Mobile add-ons: `fixed inset-y-0 left-0 z-40 w-[85vw] max-w-[20rem]
    transform transition-transform duration-200 -translate-x-full`
  - When `drawers.left` is true: `translate-x-0`
  - At `md+`: `md:static md:translate-x-0 md:w-72 md:z-auto`
- **`ChatPanel.vue`** — similar:
  - Base: `w-96 bg-white dark:bg-zinc-900 border-l ...`
  - Mobile (tablet) add-ons: `fixed inset-y-0 right-0 z-40 w-96 max-w-[85vw]
    transform transition-transform duration-200 translate-x-full`
  - When `drawers.right` is true on `sm` width: `translate-x-0`
  - Phone (`< sm`): override to bottom sheet — `fixed left-0 right-0
    bottom-0 top-auto h-[85vh] w-full rounded-t-2xl translate-y-full` →
    `translate-y-0` when open.
  - At `md+`: `md:static md:translate-x-0 md:translate-y-0 md:w-96
    md:h-auto md:rounded-none md:z-auto`
- **`PdfViewer.vue`** — header toolbar: wrap zoom/thumbs/search buttons in
  an "overflow" group that collapses to a single `⋯` button on mobile,
  popping out a vertical menu. Page-nav stays inline. Add `safe-area-inset`
  padding for `env(safe-area-inset-top)`.

### Auto-close hooks

- `useDocuments.select` — call `drawers.closeAll()` if `isMobile.value`.
- `useThreads.select` — same.
- `ChatMessage` citation chip click — same.

### Test strategy

- Composables: unit-test `useResponsive` (matchMedia listener fires) and
  `useDrawers` (mutual exclusion, body scroll lock).
- DOM: `MobileChromeBar` renders buttons; clicking hamburger toggles
  `drawers.left`. `AppSidebar` mobile-mode `aria-hidden`/`translate`
  toggles via `drawers.left`.
- E2E (manual via Playwright): resize page to 375/768/1024, exercise:
  hamburger → sidebar slides → tap doc → drawer closes → viewer shows;
  chat-bubble → bottom sheet on phone / right drawer on tablet → send →
  works; cite-chip click → drawer closes + viewer jumps.

## Risks

- **z-index collisions** — `CitationPreview` is `z-50`; drawers `z-40`;
  backdrop `z-30`. Toast must stay above drawers (`z-50`).
- **Drawer + bottom-sheet animation jank** — keep transitions to
  `transform`-only (GPU-accelerated). No `top/left` animations.
- **iOS Safari body-scroll-lock** — `overflow: hidden` alone is
  insufficient on iOS; need `position: fixed; width: 100%` while preserving
  scroll position. Defer to v2 if it becomes a real issue; for v1 stick
  with `overflow: hidden`.
- **Viewer canvas resize on width change** — `usePdfViewer.drawCurrent`
  already cancels prior render tasks, so a resize-driven re-render is safe.
  But we currently don't observe width changes — the viewer renders only on
  page/zoom change. **Action:** add a `ResizeObserver` on the viewer
  container in a follow-up if scaling looks wrong; out of scope for v1.

## Out-of-scope follow-ups

- Drag-to-dismiss bottom sheet.
- Pull-to-refresh disable on iOS (overscroll-behavior).
- Landscape phone tweaks (the chat sheet at 85 vh on a 375-tall landscape
  would only leave ~56 px for viewer; might need a width-aware override but
  not common enough to design around in v1).
