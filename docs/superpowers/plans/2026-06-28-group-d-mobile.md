# Plan — Group D Mobile / Responsive Layout

Spec: `2026-06-28-group-d-mobile-design.md`

Six discrete tasks; each is a single commit. Continuous-run pacing, no
checkpoint between tasks. Verification gate at the end (Task 7).

## Task 1 — `useResponsive` composable

Add `src/composables/useResponsive.ts` exposing module-singleton refs
`isMobile` (`< 768px`) and `isPhone` (`< 640px`) driven by `matchMedia`.

Spec for `tests/composables/useResponsive.spec.ts`:
- on import, both refs reflect current matches
- changing the matchMedia state triggers ref updates
- listener attaches once across multiple importers

**Commit:** `feat(d1): useResponsive composable with isMobile + isPhone`

## Task 2 — `useDrawers` composable

Add `src/composables/useDrawers.ts` with `{ left, right }` reactive state,
`openLeft/openRight/closeAll/toggleLeft/toggleRight`, and a derived
`anyOpen` flag. Opening one drawer auto-closes the other.

Side-effect: when `anyOpen` toggles, set `document.body.style.overflow` to
`hidden` or restore the prior value.

Tests:
- mutual exclusion (openLeft after openRight → only left)
- closeAll clears both
- body overflow toggled on open/close

**Commit:** `feat(d1): useDrawers composable with mutual-exclusion + body lock`

## Task 3 — `MobileChromeBar` + `DrawerBackdrop` components

- `src/components/mobile/MobileChromeBar.vue` — `md:hidden` flex bar with
  hamburger button, active doc name (truncated), chat-bubble button. Wire
  to `useDrawers.toggleLeft/toggleRight` and `useDocuments.activeDoc`.
- `src/components/mobile/DrawerBackdrop.vue` — `fixed inset-0 bg-black/40
  z-30 transition-opacity` only rendered when `useDrawers.anyOpen`. Click
  → `closeAll`.

Unit spec:
- Bar renders both buttons + truncated name
- Clicking hamburger toggles `drawers.left`
- Backdrop click calls `closeAll`

**Commit:** `feat(d2): MobileChromeBar + DrawerBackdrop`

## Task 4 — `AppSidebar` mobile drawer + auto-close on select

Add mobile-mode classes; bind `translate-x-0` to `drawers.left`.

Wire auto-close: in `AppSidebar.vue`'s `onPick` after `select`, and inside
`DocList`/`ThreadList`'s click handlers, call `drawers.closeAll()` if
`useResponsive.isMobile.value`. Do this without breaking the existing
single-responsibility of those components — easiest path is to add it
inside `useDocuments.select` and `useThreads.select` so any caller benefits.

Test:
- `useDocuments.select` closes drawers when `isMobile`
- `useThreads.select` closes drawers when `isMobile`
- desktop (`isMobile=false`) does not close

**Commit:** `feat(d3): sidebar as left drawer + auto-close on select`

## Task 5 — `ChatPanel` mobile drawer (tablet right / phone bottom)

Wrap `<aside>` with conditional classes:
- mobile tablet (`< md`, `≥ sm`): right slide
- phone (`< sm`): bottom sheet with `rounded-t-2xl` and `h-[85vh]`
- `md+`: unchanged

Use Tailwind responsive variants stacked (`max-sm:` for phone overrides).
If `max-sm:` is unavailable in v3 by default, fall back to `sm:` to add
classes from `sm+` and use base for phone.

Wire close button on the drawer header (mobile only) → `drawers.closeAll`.

Hook citation-chip click in `ChatMessage.vue` to close drawers when
`isMobile` (after the jump-to-page already fires).

Test:
- ChatMessage citation click closes drawers when mobile

**Commit:** `feat(d4): chat as right drawer / bottom sheet + auto-close on cite`

## Task 6 — App.vue integration + viewer overflow menu + safe-area padding

- `App.vue` — render `<MobileChromeBar md:hidden />` above the flex row;
  render `<DrawerBackdrop />` after the panes; keep layout column on
  mobile, row on `md+`. Bind ESC to `drawers.closeAll` via
  `useKeyboardShortcuts.closeOrBlur` (extend it if needed).
- `PdfViewer.vue` — wrap zoom/thumbs/search buttons in a `hidden md:flex`
  group on the right of the header; add a `md:hidden` `⋯` button that
  opens a small popover with the same actions stacked vertically. Page-nav
  stays inline always.
- Apply `pt-[env(safe-area-inset-top)]` to the mobile chrome bar and
  `pb-[env(safe-area-inset-bottom)]` to the bottom sheet's footer area.

Test:
- App.vue renders chrome bar at `< md`, hides at `md+` (use vitest with
  jsdom matchMedia stub)
- ESC closes drawers

**Commit:** `feat(d5): mobile chrome bar + viewer overflow menu + safe-area`

## Task 7 — Full green + manual verification + tag

1. `npm run typecheck && npm run lint && npm run test:run && npm run build`
   — all clean, no new warnings.
2. Live verification via Playwright at three widths (375, 768, 1024):
   - 375 (phone): mobile bar visible, viewer fills, hamburger opens left
     drawer (~85vw), tap doc selects + closes, chat-bubble opens bottom
     sheet (~85vh), send works, citation click closes sheet + jumps.
   - 768 (md exactly): desktop layout, mobile bar hidden.
   - 1024 (desktop): unchanged from before.
3. `git tag -a group-d-mobile -m "Group D: responsive layout — drawers below md, bottom sheet on phones"`.

**Commit:** none (tag only).

## Pacing

Continuous. Each task's tests must pass before moving on. If a Playwright
verification surfaces a real bug, treat it like the C3 canvas-race fix: a
single targeted `fix(dN): …` commit before the tag.
