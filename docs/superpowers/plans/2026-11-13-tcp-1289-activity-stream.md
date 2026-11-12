---
linear: TCP-1289
---

# Activity stream in the detail view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the description, `--detail` output gets a `## Activity` section: the issue's history events and comments merged oldest first.

**Architecture:** New `src/activity.ts` exports `renderActivity(issue)`, which fetches `history({first:100})` and `comments({first:100})` in parallel, resolves lazy relations through a per-render memo (parallel, de-duplicated by ID), turns each item into lines, sorts by `createdAt`, and returns the section's lines. `src/commands/detail.ts` appends them after the description.

**Tech Stack:** TypeScript, `@linear/sdk` ^86 (do not upgrade), vitest with the SDK fully mocked.

**Spec:** `docs/superpowers/specs/2026-11-13-tcp-1289-activity-stream-design.md` — read it first; it has the line-format table every task uses.

## Global Constraints

- `--detail` stdout stays plain Markdown. Never Alfred JSON, never throw out of `renderActivity` for history/comments failures.
- Heading exactly `## Activity`. Failure text exactly `_Activity unavailable_`. Truncation note exactly `_Older activity not shown — open in Linear for the full history_` (em dash).
- Event line: `* **<Actor>** <text> · <timestamp>` (middle dot `·`, U+00B7).
- Comment: blank line, `**<Author>** commented · <timestamp>` (or `replied` when `parentId` is set), blank line, body unchanged, blank line.
- Timestamps: `date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })` → `12 Nov 2026, 14:05`.
- Bot names: `botActor.name`, falling back to `Linear`. Never the word `Unknown` for an actor. Failed human-user lookup → `Someone`.
- Truncate long values to 80 chars: longer than 80 → first 79 chars + `…`.
- No sequential per-entry awaits for lazy getters: everything inside one `Promise.all`, lookups memoised by `kind:id`.
- Commit messages end with `Co-authored-by: Adam Horner <adam@horner.uk>` and include `[TCP-1289]`.

## Review Focus

- An issue with no history and no comments → section is the heading plus the created line only (Task 1 test `renders only the created line when there is no activity`).
- History entry whose `actorId` is set but the `actor` fetch rejects → `Someone`, section still renders (Task 2 test `falls back to Someone when an actor lookup fails`).
- `creator` undefined (issue created by an integration) → `issue.botActor.name` or `Linear` (Task 1 test `uses Linear for the creator when there is no user or bot`).
- Event and comment with the same `createdAt` → stable order, event list order preserved, created line first (Task 1 test `keeps the created line first on a timestamp tie`).
- Comment body containing Markdown headings/lists → passed through unchanged (Task 1 test in `shows comments with author, timestamp and body`, body includes `## Heading\n- item`).

---

### Task 1: Activity section skeleton — created line, comments, ordering, failure, truncation

**Files:**
- Create: `src/activity.ts`
- Modify: `src/commands/detail.ts` (append Activity after the description line)
- Modify: `vitest.config.mts` (add `env: { TZ: 'UTC' }` under `test`)
- Test: `tests/activity.test.ts` (new), `tests/commands/detail.test.ts` (extend `makeMockIssue` defaults)

**Interfaces:**
- Produces:
  - `export function formatTimestamp(date: Date): string`
  - `export function truncate(value: string, max = 80): string`
  - `export async function renderActivity(issue: Issue): Promise<string[]>` — returns `['## Activity', ...]`; never rejects for history/comments failures.
  - Internal (exported for Task 2): `type Lookup = <T>(key: string, fetch: () => Promise<T> | undefined) => Promise<T | undefined>` — memoised by `key`, rejected fetches resolve to `undefined`; a `makeLookup(): Lookup` factory. And `async function historyLines(entry: IssueHistory, lookup: Lookup): Promise<string[]>` returning `[]` in this task (Task 2 fills it in).
  - Actor helper: `async function actorName(botActor: { name?: string | null } | null | undefined, userId: string | undefined | null, fetchUser: () => Promise<User> | undefined, lookup: Lookup): Promise<string>` → `botActor.name` → user `displayName` (key `user:<id>`) → `Someone` if id set but lookup gave nothing → `Linear`.

- [ ] **Step 1: Add test-mock defaults.** In `tests/commands/detail.test.ts` `makeMockIssue()`, add `creator: Promise.resolve({ displayName: 'Adam Horner' })`, `creatorId: 'u-adam'`, `history: vi.fn().mockResolvedValue({ nodes: [], pageInfo: { hasNextPage: false } })`, `comments: vi.fn().mockResolvedValue({ nodes: [], pageInfo: { hasNextPage: false } })`. Run `npm test` — existing tests still pass.

- [ ] **Step 2: Write failing tests** in `tests/activity.test.ts` (build mock issues inline; a small local `makeIssue(overrides)` helper mirroring the detail one is fine) and in `tests/commands/detail.test.ts`:
  - `formatTimestamp(new Date('2026-11-12T14:05:00Z'))` → `'12 Nov 2026, 14:05'`.
  - `truncate('a'.repeat(81))` → `'a'.repeat(79) + '…'`, length 80; `truncate('short')` → `'short'`; an 80-char string unchanged.
  - `renders only the created line when there is no activity`: issue `createdAt` 2026-11-01T09:00Z → lines equal `['## Activity', '* **Adam Horner** created the issue · 1 Nov 2026, 09:00']`.
  - `uses Linear for the creator when there is no user or bot`: `creator: undefined`, `creatorId: undefined`, no `botActor` → `* **Linear** created the issue · …`; with `botActor: { name: 'GitHub' }` → `**GitHub**`.
  - `shows comments with author, timestamp and body`: comment `{ createdAt, body: 'Looks good\n\n## Heading\n- item', userId: 'u-1', user: Promise.resolve({ displayName: 'Jenine' }), parentId: null }` → output contains `'\n**Jenine** commented · <ts>\n\nLooks good\n\n## Heading\n- item\n'`, with a blank line before the header.
  - `marks replies`: comment with `parentId: 'c-1'` → `**X** replied · …`.
  - `shows the bot name on bot comments`: `botActor: { name: 'Autofix' }`, `user: undefined`, `userId: undefined` → `**Autofix** commented`; and `botActor: null, user undefined` → `**Linear** commented`. Output never contains `Unknown`.
  - `orders comments oldest first`: comments at 10:00 and 12:00 passed in reverse → created line, then the 10:00 comment, then the 12:00 one. (The interleaved events-and-comments test is in Task 2, once events render.)
  - `keeps the created line first on a timestamp tie`: comment `createdAt` equal to issue `createdAt` → created line comes first.
  - `shows Activity unavailable when history fails`: `history: vi.fn().mockRejectedValue(new Error('boom'))` → via `getIssueDetail`, output contains the description and ends with `'## Activity\n_Activity unavailable_'`. Same for `comments` rejecting.
  - `notes older activity when history has more pages` and `… when comments have more pages`: `pageInfo.hasNextPage: true` → last line is `_Older activity not shown — open in Linear for the full history_`, preceded by a blank line.
  - `fetches 100 of each`: `history` and `comments` called with `{ first: 100 }`.
  - detail test `appends the Activity section after the description`: index of `'## Activity'` > index of the description text.

- [ ] **Step 3: Run** `npx vitest run tests/activity.test.ts tests/commands/detail.test.ts` — expect failures (module missing).

- [ ] **Step 4: Implement `src/activity.ts`** per Interfaces and the spec. Items are `{ createdAt: Date; order: number; lines: string[] }`; sort by `createdAt` then `order` (created = 0, then history entries, then comments, in input order). Comment item lines: `['', header, '', body, '']`. Join everything flat; collapse nothing else. Use SDK types (`Issue`, `IssueHistory`, `Comment`, `User` from `@linear/sdk`). In `detail.ts`, after the description push, `lines.push('', ...(await renderActivity(issue)))`. Add `env: { TZ: 'UTC' }` to `vitest.config.mts`.

- [ ] **Step 5: Run** `make check` — all pass (typecheck + tests).

- [ ] **Step 6: Commit** `feat: add the Activity section to the detail view [TCP-1289]`, tick this task's boxes, push.

### Task 2: History event lines, bot actors, de-duplication, docs

**Files:**
- Modify: `src/activity.ts` (`historyLines`)
- Modify: `CLAUDE.md`
- Test: `tests/activity.test.ts`

**Interfaces:**
- Consumes: `Lookup`, `actorName`, `truncate`, `formatTimestamp`, `renderActivity` from Task 1.
- Produces: `historyLines(entry, lookup)` returning one `* **Actor** <text> · <ts>` line per recognised change, in the spec table's order (status, assignee, labels added, labels removed, title, priority, project, relations, attachment, description). Actor resolved once per entry with `actorName(entry.botActor, entry.actorId, () => entry.actor, lookup)`; lookups keyed `user:<id>`, `state:<id>`, `project:<id>`, `attachment:<id>`. State/project lookup miss → `Unknown`. Priority names: `0 No priority, 1 Urgent, 2 High, 3 Medium, 4 Low`.

- [ ] **Step 1: Write failing tests** (one per event type, through `renderActivity`, asserting the exact text after `* **Adam** ` and before ` · `):
  - status: `fromStateId:'s1', fromState: Promise.resolve({name:'In Definition'}), toStateId:'s2', toState: Promise.resolve({name:'In Progress'})` → `moved from In Definition to In Progress`; only `to` → `moved to In Progress`.
  - assignee: both → `reassigned from Adam to Jenine`; only to → `assigned to Jenine`; only from → `unassigned Adam`.
  - labels: `addedLabels:[{name:'Autofix'}]` → `added label Autofix`; two → `added labels A, B`; `removedLabels:[{name:'Autofix'}]` → `removed label Autofix`.
  - title: `fromTitle:'Old', toTitle:'New title'` → `changed the title to "New title"`; a 100-char title is truncated to 80 with `…`.
  - priority: `fromPriority:4, toPriority:2` → `changed priority from Low to High`; `toPriority:1` only → `set priority to Urgent`.
  - project: both → `moved from project Alpha to Beta`; only to → `added to project Beta`; only from → `removed from project Alpha`.
  - relations: `relationChanges:[{identifier:'TCP-1', type:'ba'}, {identifier:'TCP-2', type:'br'}]` → `added a relation to TCP-1` and `removed a relation to TCP-2` (two lines).
  - attachment: `attachmentId:'a1', attachment: Promise.resolve({title:'PR #9', url:'https://github.com/x/pull/9'})` → `linked [PR #9](https://github.com/x/pull/9)`; attachment rejects → `linked an attachment`.
  - description: `updatedDescription: true` → `updated the description`.
  - multi-change entry (status + assignee) → two lines, status first, same actor and timestamp.
  - `skips unknown history entries`: entry with only `toCycleId:'c'` / `toDueDate` → no line; no `Unknown`, no throw.
  - `shows the bot name on bot events`: `botActor:{name:'GitHub'}`, no actor → `* **GitHub** linked …`; `botActor:null`, no actorId → `* **Linear** …`.
  - `falls back to Someone when an actor lookup fails`: `actorId:'u1'`, `actor: Promise.reject(new Error('x'))` → `* **Someone** …`.
  - `merges events and comments oldest first`: comments at 10:00, 12:00, events (`updatedDescription:true`) at 11:00, 13:00, passed out of order → lines appear 10, 11, 12, 13.
  - `looks up each user once`: two entries with `actorId:'u1'` whose `actor` is a getter (`Object.defineProperty(entry,'actor',{get: spy})`, spy returns `Promise.resolve({displayName:'Adam'})`) → spy called once in total.

- [ ] **Step 2: Run** `npx vitest run tests/activity.test.ts` — new tests fail.

- [ ] **Step 3: Implement `historyLines`.** Kick off the actor lookup and all of the entry's value lookups together (`Promise.all`), then build lines. Relation direction: type ends with `r` or contains `remove` (case-insensitive) → removed, else added. `renderActivity` already runs all entries in one `Promise.all`.

- [ ] **Step 4: Run** `make check` — pass.

- [ ] **Step 5: Update `CLAUDE.md`:** repo layout gains `activity.ts  Activity section for --detail (history + comments, merged)`; the Output/detail notes say the detail view ends with `## Activity`; Testing conventions say the mock issue also needs `history`, `comments` (connections with `pageInfo`) and `creator`; mention `TZ=UTC` in `vitest.config.mts`. Keep it short.

- [ ] **Step 6: Run** `make check` and `npm run build` (builds into `dist/workflow/` in a worktree) — both succeed.

- [ ] **Step 7: Commit** `feat: render history events in the Activity section [TCP-1289]`, tick boxes, push.
