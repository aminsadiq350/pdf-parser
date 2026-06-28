# Plan — Group E Threading Upgrades

Spec: `2026-06-28-group-e-threading.md`

Six tasks. Continuous-run, no per-task checkin. Verification gate at the
end (Task 7).

## Task 1 — `suggestThreadName` helper

`src/lib/threadName.ts` with `suggestThreadName(text: string): string`.
Pure function, no Vue / Dexie.

Spec `tests/lib/threadName.spec.ts` (6+ cases):
- empty / whitespace → ''
- short single sentence → returned unchanged (no trailing punctuation)
- multi-sentence → picks the first sentence
- > 50 chars no sentence end → truncated at word boundary + ellipsis
- > 50 chars with sentence end before 50 → returned without ellipsis
- internal whitespace collapsed

**Commit:** `feat(e1): suggestThreadName helper`

## Task 2 — Auto-name on first user message + `cleanupIfEmpty`

In `useThreads`:
- Add `deleteThread(id)` to expose the existing capability.
- Add `cleanupIfEmpty(id)` that deletes the thread only if `name === ''`
  AND no messages exist for it.
- Patch `select(newId)` to call `cleanupIfEmpty(previousActiveId)` BEFORE
  swapping `activeThreadId`. Skip if previous is null or equals newId.

In `useChat.send` (after the user's message is persisted, before invoking
the LLM):
- If `thread.name === ''`, compute `suggestThreadName(text)`. If non-empty,
  call `useThreads.rename(thread.id, name)`.

Tests:
- `useThreads.cleanupIfEmpty` deletes nameless empty thread; preserves a
  named empty thread; preserves a thread with messages.
- `useThreads.select` triggers cleanup on previous.
- `useChat.send` renames an unnamed thread to the message's first sentence.
- `useChat.send` does not rename a thread that already has a name.

**Commits:**
- `feat(e2): useThreads.cleanupIfEmpty + deleteThread`
- `feat(e1): auto-name thread from first user message in useChat.send`

## Task 3 — `filterThreads` helper + search input UI

In `useThreads`:
- Add `filterThreads(query: string, docs: Document[]): Thread[]` — exposed
  helper (or just `src/lib/threadFilter.ts` if it's purer). I'll put it in
  `src/lib/threadFilter.ts` since it doesn't touch reactive state.

`tests/lib/threadFilter.spec.ts`:
- empty query → all threads
- matches name (case-insensitive)
- matches via attached doc name
- no match → empty array

`ThreadList.vue` gains a search `<input>` above the existing content.
State held in a local `query` ref. Filtered list passed to render.

**Commit:** `feat(e4): filterThreads helper + sidebar thread search input`

## Task 4 — Per-doc grouping in `ThreadList`

Refactor `ThreadList.vue` template:
- If `useDocuments.activeId.value != null`, split filtered list into
  `forDoc` (threads whose docIds include activeId) and `others`. Render
  two `<section>`s with their own headers. The `+ New for this doc` button
  lives in the first section header.
- Else: single "All threads" section + a generic `+ New empty thread`
  button.
- Suppress a section's header + button if its threads array is empty
  AND the query filter is active (avoid showing "Threads for X" with
  nothing inside when searching).

Tests:
- With active doc and matching threads: two groups visible.
- Without active doc: one group.
- `+ New for this doc` calls `threads.create({ docIds: [activeId] })` and
  selects the result.

**Commit:** `feat(e3): per-doc thread grouping with new-thread button`

## Task 5 — `threadStats` (count + last snippet) + `ThreadItem` upgrade

`useThreads`:
- Add `threadStats` ref `Map<number, { count: number; lastSnippet: string }>`.
- On `loadAll`, after threads load, populate stats: for each thread fetch
  `count` and the last message via `db.messages.where('[threadId+createdAt]')
  .between([id,0],[id,Infinity]).last()`. Set the map.
- On `appendMessage`, increment count and update `lastSnippet` for that
  thread.
- On `clearMessages`, reset count to 0 and lastSnippet to ''.
- On `deleteThread`, drop from the map.
- Expose `threadStats` from `useThreads`.

Snippet derivation: take the message `text`, strip markdown formatting
(quick regex: backticks, asterisks, leading hashes), collapse whitespace,
truncate to 80 chars with ellipsis.

`ThreadItem.vue`:
- Reads `useThreads().threadStats.value[thread.id]`.
- Shows `lastSnippet` under the name (text-xs text-zinc-400 truncate).
- Shows `count msgs` badge next to doc chips. Hide if `count === 0`.

Tests:
- After loadAll with seeded messages, threadStats has correct counts +
  last snippet for each thread.
- After appendMessage, stats reflect the new last message and bumped
  count.
- After clearMessages, stats reset.
- `ThreadItem` renders `count msgs` badge when count > 0 and hides
  otherwise.

**Commit:** `feat(e5): thread stats (count + last snippet) in sidebar items`

## Task 6 — Verification + tag

1. `npm run typecheck && npm run lint && npm run test:run && npm run build`
   — all clean.
2. Live Playwright run on the existing browser session:
   - Reset DB (or import a fresh doc) and verify default thread shows
     nameless initially.
   - Send "Hello what is this PDF?" → thread auto-renames in sidebar.
   - Click `+ New for this doc` → switching away from the new (untouched)
     thread back to the original auto-cleans the empty one.
   - Type "hello" in the search → only matching thread visible.
3. `git tag -a group-e-threading -m "..."`.

**Commit:** none.

## Pacing

Continuous. Each task's tests must pass before moving on. Surface any
real bugs as a `fix(eN): …` commit before the final tag.
