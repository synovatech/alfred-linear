---
linear: TCP-1227
---

# TCP-1227: copy the status-based Review Gate from kindred-explore

## Intent

alfred-linear's `.github/workflows/review-gate.yml` is the old check-run gate: it requires a review by `claude[bot]` (Claude Code Review, now switched off) and reports as a check run, so a failed run stays on its commit and keeps blocking the merge after the cause is fixed. KIN-374 replaced it in kindred-explore with a gate that publishes `Review Gate` as a **commit status** (each evaluation overwrites the last) and requires a review by Autoreview (`synova-autoreview[bot]`). This ticket brings that file to alfred-linear unchanged, so PRs here stop getting stuck on stale `Review Gate` failures.

## Goals

- `.github/workflows/review-gate.yml` is byte-identical to kindred-explore's current copy on its default branch. Check: `diff <(gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d) .github/workflows/review-gate.yml` prints nothing.
- On this ticket's PR, once Autoreview has reviewed, `gh api repos/synovatech/alfred-linear/commits/<head-sha>/statuses --jq '[.[] | select(.context == "Review Gate")][0].state'` prints `success`. This is checked after the PR exists, not locally.
- The baseline checks (`make check`) still pass.

## Non-goals

- Any other workflow file (`ci.yml`), the org ruleset, other repos.
- Adapting the gate for this repo. The design is settled in KIN-374. alfred-linear has no `Vercel` statuses, so the shared file already treats it as not deploying to Vercel: the gate only waits for Autoreview.
- Turning Claude Code Review back on.

## Anti-goals

- Any edit to the copied bytes (reformatting, comment tweaks, line-ending changes). The file is shared across repos, and changes belong in kindred-explore first.

## Design

1. Replace `.github/workflows/review-gate.yml` with the exact bytes fetched from the GitHub contents API (base64-decoded, never retyped).
2. Verify with the ticket's `diff` command and lint it with `actionlint` (ShellCheck is on PATH). A lint finding is reported, not fixed, because fixing it would break byte-identity.
3. `CLAUDE.md` is left alone: it doesn't describe Review Gate. (The ticket only asks to update it if it does.)

## Assumptions

- **`CLAUDE.md` doesn't describe Review Gate.** `grep -i "review gate" CLAUDE.md` finds nothing, and the CI paragraph only says Autoapprove won't approve a red PR. So per the ticket, `CLAUDE.md` is untouched.
- **The old gate shouldn't block this PR.** `pull_request` and `pull_request_review` events run the workflow file from the PR's merge ref (`refs/pull/<n>/merge`), which carries this branch's file, so this PR runs the new gate, not `main`'s old one. If an old-style `Review Gate` check run blocks anyway, the ticket's Watch out applies: a person with admin access merges with the ruleset bypass. This goes in the PR's manual steps as a conditional item. If the PR ever has a merge conflict, `pull_request` workflows don't run at all, so no status is posted until the conflict is resolved.
- **"Copy kindred-explore's current file"** means its default branch at the time of the copy. The blob SHA fetched on 2026-11-10 was `d7ba2bd3ff18df42f3c710b3fe1bbfe2f2299a50`.
- **The PR-status "Done when" item is verified after the PR is opened and Autoreview has reviewed it.** It can't be proved before Autoreview runs, which happens after Autofix hands over.
