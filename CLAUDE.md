# CLAUDE.md — Alfred Linear Workflow

## What this is

An Alfred 5 workflow that searches, views, and creates Linear issues. A single esbuild bundle (`workflow-folder/js/main.js`) is called by Alfred's nodes. OAuth 2.0 PKCE, no client secret. Tests mock the SDK entirely — no real network calls in `npm test`.

## Commands

```bash
npm run build     # compile TS + copy workflow/info.plist + workflow/icon.png → workflow-folder/
npm test          # vitest, all SDK calls mocked
npm run sync      # pull Alfred UI edits back: workflow-folder/{info.plist,icon.png} → workflow/
npm run typecheck # tsc --noEmit
```

## Repository layout

```
src/
  index.ts          entry point — arg parsing, auth check, dispatch
  auth.ts           OAuth PKCE, token storage, refresh
  linear.ts         getClient() with auto-refresh
  alfred.ts         Alfred JSON output helpers
  config.ts         LINEAR_CLIENT_ID, OAUTH_CALLBACK_PORT, scopes
  commands/
    search.ts       → AlfredItem[]   (stdout: Alfred JSON via alfredOutput)
    detail.ts       → Markdown str   (stdout: plain text to Text View)
    create.ts       → URL str        (stdout: plain URL to Open URL node)
workflow/           Tracked source-of-truth copies of Alfred assets
  info.plist
  icon.png
workflow-folder/    Symlink → Alfred.alfredpreferences/workflows/user.workflow.…
  js/main.js        Built bundle (git-ignored)
  auth.json         OAuth tokens (git-ignored, mode 0600)
```

## Output format rules — do not mix these up

| Command path | stdout content | Consumer |
|---|---|---|
| Script Filter (no flag) | `alfredOutput(items)` — Alfred JSON | Alfred Script Filter |
| `--detail` | plain Markdown string | Alfred Text View |
| `--create` | plain URL string | Alfred Open URL node |
| `--auth` | nothing (process exits) | Alfred waits for exit |

Errors in `--detail` must be plain text (shown in Text View). Errors in `--create` have no good outlet — they surface as a garbled URL attempt. The Script Filter catch-all uses `alfredOutput`.

## Search syntax & smart options

Default search is **active-only**: it applies `ACTIVE_STATE_FILTER` (`src/smartOptions.ts`), a filter on the meta-state `state.type` — `in: ['triage','backlog','unstarted','started']` (see `ACTIVE_STATE_TYPES`). This excludes `completed`, `canceled`, and `duplicate`. A positive `in` list is deliberate: `type` is a fixed enum, and a negative filter would wrongly let `duplicate` through.

A `:`-prefixed **smart-option** namespace composes filters. Options chain left-to-right before the free-text term; all combine with AND.

| Option | Kind | Filter |
|---|---|---|
| `:all` | flag | clears the state filter (every state) |
| `:done` | flag | `state.type eq completed` |
| `:mine` | flag | `assignee.isMe eq true` |
| `:team <KEY>` | arg | `team.key eq KEY` — arg autocompleted from live teams |
| `:project "<Name>"` | arg | `project.name eq Name` — arg autocompleted from live projects, scoped to a `:team` chosen earlier |
| `:priority <Level>` | arg | `priority eq N` — static picker (Urgent/High/Medium/Low/None → 1/2/3/4/0) |

State options (`:all`, `:done`, default) are one dimension — last in the chain wins. Adding an option = one entry in `SMART_OPTIONS`; a new async arg source also needs a fetcher in `commands/lookups.ts` and an item builder in `alfred.ts`.

**Trailing space is the "token complete" signal** (standard Alfred multi-arg pattern). Token abbreviations resolve by **unique prefix** (`:proj`→project; `:p`/`:pr` are ambiguous with priority→picker). Behaviour:
- `:` / `:pro` (no trailing space) → option picker (`valid:false` items whose `autocomplete` rebuilds the whole chain + `:token `).
- `:team ` / `:team EN` → team suggestions; `:team ENG :proj ` → ENG-scoped project suggestions.
- `:priority ` → the five static levels.
- `:mine ` / `:team ENG ` (filters, **no free-text term**) → **list mode**: `client.issues({filter, orderBy: UpdatedAt})` (browse), not full-text search.
- `<filters> <term>` → `searchIssues(term, filter)`.

Split across `src/query.ts` (pure tokenizer + `parseQuery` + `assembleFilter`), `src/smartOptions.ts` (registry), `src/commands/lookups.ts` (team/project fetch). All handled inside the Script Filter (main.js) — no `info.plist` routing (suggestion items are `valid:false`; only Tab-complete, never Enter).

## Alfred workflow wiring (info.plist)

The Conditional uses `matchmode: 6` (ICU regex) with patterns `^setup::` and `^create::`. Else branch routes to detail.

Run Script nodes use `$alfred_preferences/workflows/$alfred_workflow_uid` for the DIR — **not** `${BASH_SOURCE[0]}`, which resolves to Alfred's script cache and not the workflow folder.

Run Script nodes pass the incoming arg as `$1` (`scriptargtype: 1`). Do not use `{query}` substitution in script text — it is not reliably substituted when scripts run from the cache directory.

After editing `info.plist` programmatically, Alfred needs to reload. Close and re-open Alfred Preferences, or click away from the workflow and back.

## Build direction vs sync direction

`npm run build` copies **workflow/ → workflow-folder/** (repo is source of truth).  
`npm run sync` copies **workflow-folder/ → workflow/** (captures Alfred UI edits for committing).

If you have unsaved Alfred UI changes, run `npm run sync` **before** `npm run build`, or the build will overwrite them.

## Linear SDK notes

- `client.issue(uuid)` takes the internal UUID, not the `TEAM-123` identifier.
- `client.issues({ filter: { number: { eq: n }, team: { key: { eq: key } } } })` is the correct way to look up by identifier.
- `client.issueSearch()` is deprecated — do not use it.
- `issue.state`, `issue.assignee`, `issue.team` are lazy Promise properties (plain property access).
- `issue.attachments()`, `issue.children()` are methods returning `{ nodes: [...] }`.
- The installed version is pinned at `^86.0.0`.

## Testing conventions

All tests mock `../../src/linear` with `{ getClient: vi.fn() }`. The mock client needs all methods used by the command under test (`issues`, `attachments`, `children`, etc.). `makeMockIssue()` in `detail.test.ts` is the reference for what shape the SDK returns.

---

## Outstanding ideas (not yet implemented)

These were either listed in the original design spec as future phases, or surfaced during development and deferred.

### Actions on existing issues
- Move an issue through statuses (e.g. `→ In Progress`, `→ Done`) as an action on a search result
- Assign an issue to a team member
- Set or change priority
- Add issue to the current cycle
- Copy issue URL to clipboard as an alternate `↩` action (⌘↩ or similar)
- Add a comment to an issue

### Richer search and navigation
- ~~Filter search by team, project, assignee, status, or label~~ **Done** (except label): `:all`/`:done` (status), `:mine` (assignee), `:team KEY`, `:project "Name"`, `:priority Level`, composable, with live autocomplete. Add more via the `SMART_OPTIONS` registry — a new flag is one entry; a new async arg source also needs a `commands/lookups.ts` fetcher + `alfred.ts` item builder. `:label` is the obvious next one.
- Search for projects and display their issues
- Browse by team → project → issues
- List views / custom views and browse their contents
- List and navigate to cycles

### Creation enhancements
- Set priority when creating (`+TCP!2 title` or similar)
- Set assignee when creating
- Set project when creating
- Create a project

### Alfred workflow configuration
- User-configurable default team (`userconfigurationconfig` in `info.plist`) so `+` alone defaults to that team
- User-configurable default assignee (e.g. self)

### Infrastructure
- `npm run package` — zip `workflow-folder/` into `alfred-linearis.alfredworkflow` for one-click install without needing the repo
- Paginate search results (currently returns the first page from the SDK with no "load more")
- Show issue labels in search subtitles and detail view
- Display priority indicator in search results and detail view
