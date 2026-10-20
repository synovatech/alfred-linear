---
linear: TCP-1194
---

# TCP-1194: add the Review Gate workflow

## Intent

The org ruleset *Synova standard main branch ruleset* requires a status check named **Review Gate** on every repo's default branch. alfred-linear has no workflow producing that check, so no PR can merge without an org-admin bypass. Add the canonical workflow so the check exists here.

## Goals

- `.github/workflows/review-gate.yml` exists and is byte-identical to `synovatech/kindred-explore` `main`'s copy. Check: `diff <(gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d) .github/workflows/review-gate.yml` prints nothing.
- `actionlint` (ShellCheck on PATH) reports no errors for it.
- The PR adding it shows a check run named **Review Gate**. It is expected to fail until Claude Code Review has reviewed the PR.
- `CLAUDE.md` gains a `## Linear` section naming the Alfred Linear project, so Autofix can map tickets to this repo.

## Non-goals

- Other workflows or CI jobs (no test/typecheck workflow).
- Ruleset changes.
- Enabling or configuring Claude Code Review.

## Anti-goals

- Any edit to the workflow file: no `branches:` filter, no hard-coded Vercel skip, no reformatting or added comments. A divergent copy defeats "same file in every repo".

## Constraints

- The file is copied verbatim from kindred-explore `main` (fetched 2026-10-20, SHA-256 `debe5dd41587a24b4abfabde678895a8cbd418c65dbd59287f16b326ba17d639`).
- `.github/workflows/` doesn't exist yet; create it.
- alfred-linear has never deployed to Vercel, so the workflow's Vercel step skips itself at runtime. No change is needed for that.
- No tests in the repo cover CI files; verification is the `diff` command, `actionlint`, and the PR's check list.

## Design

1. Create `.github/workflows/review-gate.yml` with the exact bytes of the canonical file (fetch via the GitHub contents API and base64-decode, don't retype).
2. Add to `CLAUDE.md`, after `## Commands`:

   ```markdown
   ## Linear
   - Project: Alfred Linear — https://linear.app/synovatech/project/alfred-linear-9e8ed2cbcc32
   ```

3. Verify with the `diff` command and `actionlint`; `npm run typecheck` and `npm test` still pass (sanity only, nothing in `src/` changes).

## Assumptions

- **Including the `CLAUDE.md` `## Linear` section on this branch.** The ticket's Deploy / manual section says Autofix needs either a project for this ticket or a `## Linear` section in `CLAUDE.md`. The runner added the section in the main checkout and asked for it to land on this ticket's branch. It is a two-line doc change, not a workflow or CI change, so it's outside "Out of scope".
- **"The PR shows a check run named Review Gate"** is checked after the PR is opened (`gh pr checks`), not by a local test. A failing result is the expected outcome, since Claude Code Review isn't enabled for this repo.
- **No CHANGELOG or README update.** Neither documents CI today.

## Left to the builder

Nothing material: the workflow content is fixed and the `CLAUDE.md` text is given above.

## Manual steps (for the reviewer)

- Enable Claude Code Review for alfred-linear (Claude admin settings). Until then this PR, and every later one, needs an org-admin bypass to merge.
