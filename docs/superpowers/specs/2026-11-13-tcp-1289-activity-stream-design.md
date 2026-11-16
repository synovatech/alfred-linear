---
linear: TCP-1289
---

# TCP-1289: activity stream in the issue detail view

## Intent

The `--detail` Text View ends at the description. Adam wants to follow a ticket's history, including what the bots (Autofix, Autoreview, GitHub) wrote, without opening Linear. Add a `## Activity` section after the description: one oldest-first timeline merging history events and comments, like Linear's Activity panel but without icons, reactions or collapsing.

## Goals (from the ticket's "Done when")

- After the description, a `## Activity` heading, then a "created" line, then history events and comments merged and sorted oldest first by `createdAt`.
- The first entry is a "created" line from `issue.createdAt` and `issue.creator`.
- One readable line each (at least) for: status change, assignee change, labels added/removed, title change, priority change, project change, relation added/removed, attachment/link added, description updated. One test per type.
- Any other history entry is skipped silently (no line, no crash).
- Comments: a header `**Author** commented · <timestamp>` (`replied` when `parentId` is set), then the body unchanged, separated from event lines by blank lines. Replies sit at their own `createdAt` in the timeline.
- Bot and integration events and comments show `botActor.name`, falling back to `Linear`; never `Unknown`.
- If fetching history or comments fails, the rest of the detail view renders and the Activity section is `_Activity unavailable_`.
- If either connection has more pages, the section ends with `_Older activity not shown — open in Linear for the full history_`.
- `make check` passes; `CLAUDE.md` describes the Activity section and that test mocks need `history` and `comments`.

## Non-goals

- Search result subtitles; posting, editing or reacting to comments; priority display (TCP-1253); the SDK upgrade (TCP-1259; build against `^86`); `info.plist` or Alfred wiring.
- Pagination beyond the first page; icons; reactions; collapsing runs of events.
- Event types outside the list above (cycle, due date, estimate, team, parent, delegate, archive, SLA, triage, releases): skipped.

## Anti-goals

- Sequential per-event network lookups (N+1). Lazy getters must be fired in parallel and de-duplicated.
- A failure in Activity breaking the detail view, or emitting Alfred JSON on stdout.

## Design

### Module layout

A new `src/activity.ts` exports `renderActivity(issue): Promise<string[]>` (the lines of the section, heading included) and the pure helpers it uses (`formatTimestamp`, `truncate`). `src/commands/detail.ts` appends `['', ...await renderActivity(issue)]` after the description. Keeping it in its own module keeps `detail.ts` readable and lets the formatting be tested directly; the ticket's tests still go through `getIssueDetail` where they assert on the whole view.

### Fetching

- `Promise.all([issue.history({ first: 100 }), issue.comments({ first: 100 })])`. If either rejects, the whole section is the heading plus `_Activity unavailable_`. The detail view's other fetches are unchanged.
- Resolving related entities: a per-render memo `Map<string, Promise<...>>` keyed by `kind:id` (`user:<id>`, `state:<id>`, `project:<id>`, `attachment:<id>`). The first entry needing an ID calls the lazy getter (`entry.actor`, `entry.toState`, `comment.user`, …) and stores the promise; later entries with the same ID reuse it. All entries are rendered inside one `Promise.all`, so every lookup is in flight together and each distinct ID is fetched once. A single lookup that rejects resolves to a fallback name (below) rather than failing the section.
- Labels (`addedLabels`, `removedLabels`) and relations (`relationChanges`) are embedded; no fetch.
- `issue.creator` is resolved the same way.

### Actor names

- Users: `displayName` (matches the existing Assignee line).
- History: `botActor?.name` if set; else the resolved `actor` (keyed on `actorId`); else `Linear`.
- Comments: `botActor?.name` if set; else the resolved `user` (keyed on `userId`); else `Linear`.
- Creator: resolved `creator`, else `issue.botActor?.name`, else `Linear`.
- **My call:** a failed lookup of a *human* user (the ID is set but the fetch rejects) renders `Someone`, so a transient error never shows `Unknown` and never misattributes the change to Linear. Failed state/project lookups render `Unknown` (they are values, not actors).

### Timestamps

`formatTimestamp(date)` = `date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })`, giving `12 Nov 2026, 14:05` in local time. Tests pin the zone by setting `env: { TZ: 'UTC' }` in `vitest.config.mts` so expected strings are deterministic.

### Line formats

Event: `* **Actor** <what changed> · <timestamp>`. One history entry can change several things at once (e.g. status and assignee); it yields one line per recognised change, in the order of the table below, all with the same actor and timestamp. An entry with no recognised change yields no lines.

| Change (history fields) | Text |
|---|---|
| created (from the issue) | `created the issue` |
| `fromStateId`/`toStateId` | `moved from <From> to <To>`; only `to`: `moved to <To>` |
| `fromAssigneeId`/`toAssigneeId` | both: `reassigned from <A> to <B>`; only to: `assigned to <B>`; only from: `unassigned <A>` |
| `addedLabels` (non-empty) | `added label(s) <A>, <B>` (`label` when one) |
| `removedLabels` (non-empty) | `removed label(s) <A>, <B>` |
| `toTitle` (with `fromTitle` or not) | `changed the title to "<new>"` (new title only, truncated) |
| `fromPriority`/`toPriority` (`toPriority` not null/undefined) | `changed priority from <P1> to <P2>`; no `from`: `set priority to <P2>`. Names: 0 No priority, 1 Urgent, 2 High, 3 Medium, 4 Low |
| `fromProjectId`/`toProjectId` | both: `moved from project <A> to <B>`; only to: `added to project <B>`; only from: `removed from project <A>` |
| `relationChanges` (each) | `added a relation to <ID>` / `removed a relation to <ID>` (see Assumptions) |
| `attachmentId` | `linked [<title>](<url>)` (title truncated); lookup fails: `linked an attachment` |
| `updatedDescription: true` | `updated the description` |

Long values (titles, attachment titles) are truncated to 80 characters with `…` (`truncate(s, 80)`: keep 79 chars + `…` when longer than 80).

Comment (blank line before and after):

```
**Autofix** commented · 12 Nov 2026, 14:05

<body unchanged>
```

`replied` instead of `commented` when `parentId` is set.

### Ordering and truncation

Build a list of `{ createdAt, lines }` items: the created line, every history entry, every comment. Stable sort by `createdAt` ascending (created line first on ties). Flatten. If `history.pageInfo.hasNextPage || comments.pageInfo.hasNextPage`, append a blank line and `_Older activity not shown — open in Linear for the full history_`.

### Tests

Extend `makeMockIssue()` with `creator`, `history` and `comments` defaults (an empty connection with `pageInfo: { hasNextPage: false }`), so existing tests keep passing. New tests, each through `getIssueDetail` unless they test a helper: interleaved order; created line; each event type; unknown entry skipped; comment header and reply; bot names on events and comments; history or comments rejecting → `_Activity unavailable_` with the description still present; `hasNextPage` → note; de-duplication (two entries with the same `actorId` call the getter once — assert via a getter spy).

### CLAUDE.md

Update the repo layout line for `detail.ts`, add `activity.ts`, note the Activity section, and under Testing conventions say the mock issue needs `history`, `comments` and `creator`. Mark the outstanding-ideas list where relevant ("Add a comment to an issue" stays; nothing else changes).

## Assumptions

- **Relation type codes.** `IssueRelationHistoryPayload.type` is an undocumented string in SDK 86 (the docstring only says "relation added or removed"). Treat a type ending in `r` or containing `remove` (case-insensitive) as removed, anything else as added, and name only the related identifier, not the relation kind. Wrong guess cost: wording only.
- **Which 100.** The ticket says "first 100", so we call `{ first: 100 }` with the API's default order and sort locally. SDK 86 exposes no sort direction for these connections, and the tests mock the SDK, so which end is dropped on a ticket with more than 100 entries isn't verified here; the note keeps the ticket's wording. Busy tickets rarely reach 100 of either. Listed in the PR as something to check on a real ticket.
- **Replies are in `issue.comments()`.** Linear returns replies in the issue's comment list, each with `parentId` set (the Linear MCP's `list_comments` shows the same flat shape), so no per-thread `children()` calls are needed.
- **External (synced) authors.** Comments synced from Slack or email normally carry a `botActor` (the integration), so they render with its name. A comment with no `botActor` and no `user` (an `externalUser` only) renders as `Linear`; resolving `externalUser` is left out to keep it simple (YAGNI). If that shows up in practice, it's one more memo key.
- **Display names.** Users render with `displayName`, as the Assignee line does.
- **Status with no `from`.** Linear records the initial state on some issues as a history entry with only `toStateId`; it renders `moved to <To>`.
- The KIN-227 screenshot was only in the session that created the ticket; the ticket's written Decisions are used instead.
