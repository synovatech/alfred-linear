# Review instructions

alfred-linear is an Alfred 5 workflow, a single esbuild bundle of TypeScript, that searches, views and creates Linear issues. `CLAUDE.md` holds the conventions; this file only changes how reviews are ranked and scoped.

## What counts as Important

- A command path writes the wrong thing to stdout (Alfred JSON for the Script Filter, plain Markdown for `--detail`, a plain URL for `--create`): see the output-format table in `CLAUDE.md`. Alfred fails silently on these.
- Search returns the wrong issues: the active-only default is dropped or leaks into exact `TEAM-123` lookups, smart options stop combining with AND, or the last state option no longer wins.
- Auth defects: tokens written to stdout or logs, `auth.json` written without mode 0600, a refresh that can lose the refresh token or loop, or a client secret added (the flow is PKCE without one).
- `info.plist` changes that break routing: an item `mods` entry with no matching modifier connection, `{query}` substitution in Run Script text, or `${BASH_SOURCE[0]}` used to find the workflow folder.
- `npm run build` writing into `workflow-folder/` from a linked worktree or CI.
- Deprecated or wrong SDK use: `client.issueSearch()`, or a `TEAM-123` identifier passed to `client.issue()`.
- A behaviour change without a test, or a test that makes a real network call instead of mocking `getClient` from `src/linear`.

Everything else is a Nit.

## Repo-specific checks

- Alfred asset changes go in `workflow/` (the tracked source of truth), never only in the Alfred UI copy.
- A new smart option is one `SMART_OPTIONS` entry; a new async argument source also needs a fetcher in `src/commands/lookups.ts` and an item builder in `src/alfred.ts`. Suggestion items are `valid: false`.
- Lazy SDK relations (`issue.state`, `issue.assignee`, `issue.team`) are awaited; connection methods (`issue.attachments()`, `issue.children()`, `issue.labels()`) are called.
- Date logic in tests passes `now` explicitly, so results don't depend on the day the suite runs.
- `CLAUDE.md` changes with the behaviour it documents: the output-format table, the search syntax and smart-option tables, and the "Outstanding ideas" list (mark an item done when it ships).
- Dependencies use exact versions, and `package-lock.json` changes with `package.json`.
- American English in code, comments and identifiers; British English in `CLAUDE.md`, `README.md` and other prose.

## Skip

- `docs/superpowers/`: past specs and plans are records, not living docs.
- The contents of `package-lock.json`, and binary assets (`workflow/icon.png`, `logos/`).
- `workflow-folder/`: a local symlink to the installed workflow.
- Wording and tone in comments and docs, unless they are wrong.

## Output

- Report at most five Nits per review; mention the rest as a count in the summary.
- Only post a finding you can point to in the diff. Don't speculate about code you haven't read.
- When a finding has more than one reasonable fix, list the options instead of picking one, so whoever acts on it knows a decision is needed.
- Summary: a one-line tally ("No issues found" or "0 Important, 2 Nit"), one bullet on what changed, then one bullet per finding, Important first. Plain language; no abbreviations such as "LGTM".
- Each finding: one sentence on what breaks, a `file:line`, and a one-line fix (or the options, when it has more than one reasonable fix). Keep the reasoning and verification in the collapsed "Why this was flagged" section.
