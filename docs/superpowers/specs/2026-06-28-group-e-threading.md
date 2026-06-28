# Group E — Threading Upgrades

## Problem

Today threading works at the data layer (multi-doc per thread, multi-thread
per doc) but the UX hides it:

- Every thread starts with `name === ''`. `ThreadList` falls back to the
  first attached doc's name, so all of a doc's threads read identically.
- `ensureDefaultThreadForDoc` always creates one default thread on doc
  selection if a single-doc thread doesn't exist; over time the sidebar
  fills with empty, never-touched, identically-named threads.
- There's only one global `+ New` thread button; no per-doc affordance, no
  grouping by "threads for this doc" vs "other threads".
- No way to find a thread by name when the list grows past a screen.

## Goals

1. Newly used threads get a memorable name automatically.
2. Empty unused threads don't linger.
3. Picking a doc reveals its threads grouped first, with a one-click
   `+ New` button for that doc.
4. A search input above the thread list filters threads by name or
   attached-doc name.
5. Each thread item shows a 1-line preview of the last message plus a
   message-count badge.

## Non-goals

- Searching message bodies (deferred — closer to F retrieval scope).
- Pinning / favouriting threads.
- Multi-doc thread creation UI (existing `attachDoc` covers it).
- AI-generated thread titles (frontend-only constraint).
- Thread folders / tags.

## Solution

### E1 — Auto-name on first user message

`src/lib/threadName.ts` ships `suggestThreadName(text: string): string`:

- Trim, collapse internal whitespace.
- Take up to the first sentence boundary (`.`/`?`/`!`), capped at 50 chars.
- If still longer than 50, hard cut at the nearest word boundary ≤ 50 and
  append `…`.
- Return `''` if input is empty/whitespace after normalization.

Hook in `useChat.send` after the user's message is persisted: if
`thread.name === ''` and `suggestThreadName(text) !== ''`, call
`useThreads.rename(thread.id, name)`. Updates state in-place.

### E2 — Empty-thread cleanup on switch-away

Add `useThreads.deleteThread(threadId)` (already implied by data layer but
not currently exposed). Add `useThreads.cleanupIfEmpty(threadId)`:

- Looks up the thread.
- If `name === ''` AND no messages exist for it in Dexie, delete from
  `db.threads` and from `threads.value`.
- Safe to call on a thread that doesn't exist (no-op).

Hook in `useThreads.select(newThreadId)`: before swapping `activeThreadId`,
call `cleanupIfEmpty(previousActiveId)`.

This keeps "default thread on doc import" from leaving permanent litter:
the moment the user switches to a different thread (or doc), the unused
default disappears. A renamed-but-empty thread is preserved.

### E3 — Per-doc thread grouping in `ThreadList`

`ThreadList.vue` reworks into:

- Search bar at top (E4 below).
- If active doc exists and matches the filter:
  - Section "Threads for {{ doc.name }}" with `+ New for this doc`
    button. Lists threads whose `docIds` includes the active doc.
- "Other threads" section listing remaining threads.

If no active doc → single "All threads" section, behaves like today.

The `+ New for this doc` button calls `threads.create({ docIds:
[activeDocId] })` then `select(t.id)`. The existing global `+ New` button
is dropped (the per-doc button replaces it; if no active doc, "All
threads" gets a generic `+ New empty thread` button).

### E4 — Library thread search

`useThreads.filterThreads(query: string, docs: Document[]): Thread[]`:

- Empty query → all threads (unchanged).
- Otherwise: case-insensitive, returns threads whose `name` includes the
  query OR whose attached `docIds` resolve to a doc name including the
  query.

`ThreadList` owns the input state. Filtered list is passed to both
sections. If a section has zero matches, hide its header.

Keyboard: typing in the input never propagates the global `←`/`→` page-nav
shortcut (already guarded by `matchShortcut`'s input check).

### E5 — Last-message preview + count in `ThreadItem`

Schema additions to in-memory state only — not persisted (derived):

- `useThreads.threadStats: ComputedRef<Record<number, { count: number;
  lastSnippet: string }>>` computed off a per-thread cache populated when
  threads load and refreshed on `appendMessage`. Pulls counts via
  `db.messages.where('threadId').equals(id).count()` and last message via
  `where('[threadId+createdAt]').between([id,0],[id,Infinity]).last()`.

  To avoid loading every message on startup, do this lazily: on
  `loadAll()`, do `count` per thread (cheap) but defer `lastSnippet`
  fetching to when each `ThreadItem` first mounts.

  Actually simpler: in `loadAll()` fetch both via two single Dexie ops —
  one `count` per thread (already a fast B-tree count) and one `last()`
  per thread. With < 200 threads this is fine; if it ever becomes a
  bottleneck we revisit.

`ThreadItem.vue` reads stats from a prop or directly via `useThreads`:

- Show `lastSnippet` truncated to 80 chars under the name (muted, single
  line).
- Show `count msgs` badge next to chips. Hide if `count === 0`.

### Test strategy

Pure helpers:
- `suggestThreadName` — 6+ cases: empty, whitespace, single short, single
  long with period, hard cut at 50, multi-sentence picks first.

Composable specs (jsdom + fake-indexeddb):
- `useThreads.cleanupIfEmpty` — deletes a nameless empty thread on a
  no-message thread; no-ops on a thread with messages; no-ops on a named
  empty thread.
- `useThreads.select` calls cleanup on previous active id.
- `useThreads.filterThreads` — query matches name; matches doc name;
  empty query returns all; case-insensitive.
- `useChat.send` triggers auto-name on first message; subsequent sends
  don't change a thread that already has a name.

Component specs:
- `ThreadList` renders two groups when active doc set; one group otherwise.
- Search input filters visible items.
- `ThreadItem` shows `count msgs` badge and last snippet.

E2E (manual via Playwright once implemented):
- Import doc → default thread shown nameless. Send "Hi" → thread renames
  to "Hi". Switch to a new thread for same doc → the original stays (now
  has name + messages); a freshly created untouched thread vanishes when
  switching away.
- Type "sample" in search → only sample-related threads remain.

## Risks

- **Auto-name fights manual rename** — if a user types a name BEFORE
  sending the first message, the auto-namer must respect that. Guard with
  `if (thread.name === '')` — explicit ✓.
- **`cleanupIfEmpty` race with in-flight `send`** — if a user clicks
  another thread while `useChat.send` is mid-stream on the source thread,
  the source has messages so cleanup won't trigger; the stream's
  appendMessage continues writing under the (now non-active) thread id.
  Safe — the chat composable already handles that pattern.
- **Last-snippet fetching cost** — N+1 Dexie queries on load. For now N is
  small. If it grows, batch via `db.messages.bulkGet(lastIds)` after a
  composite query.
- **Search clearing on doc switch** — should the query persist across
  thread/doc switches? Default: yes, persistent input state until cleared.

## Out-of-scope follow-ups

- Persistent search history.
- Multi-select bulk thread operations.
- Drag-reorder threads.
- Folders / nested groups.
