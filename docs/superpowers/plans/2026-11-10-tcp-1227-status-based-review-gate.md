---
linear: TCP-1227
---

# TCP-1227 Status-based Review Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `.github/workflows/review-gate.yml` with kindred-explore's current status-based Review Gate, byte for byte.

**Architecture:** One file, copied verbatim from the GitHub contents API. No other file changes (`CLAUDE.md` doesn't describe Review Gate, so it stays as it is).

**Tech Stack:** GitHub Actions YAML, `gh`, `actionlint`.

**Spec:** `docs/superpowers/specs/2026-11-10-tcp-1227-status-based-review-gate-design.md`

## Global Constraints

- The workflow file must be byte-identical to `synovatech/kindred-explore`'s default-branch `.github/workflows/review-gate.yml`. Expected blob SHA as of 2026-11-10: `d7ba2bd3ff18df42f3c710b3fe1bbfe2f2299a50`. No edits, reformatting or line-ending changes.
- Don't touch `ci.yml`, `CLAUDE.md`, or anything outside `.github/workflows/review-gate.yml`.

## Review Focus

- A trailing-newline or encoding difference from retyping instead of decoding: the `diff` and `git hash-object` checks in Task 1 catch it.
- An `actionlint` finding in the copied file: report it, don't fix it (a fix breaks byte-identity; it belongs in kindred-explore).

---

### Task 1: Copy the status-based Review Gate

**Files:**
- Modify (replace): `.github/workflows/review-gate.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a workflow publishing the `Review Gate` commit status (job name `Review Gate (evaluate)`).

- [x] **Step 1: Confirm the current file differs (the "failing test")**

Run: `diff <(gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d) .github/workflows/review-gate.yml > /dev/null; echo $?`
Expected: `1`

- [x] **Step 2: Replace the file with the fetched bytes**

```bash
gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d > .github/workflows/review-gate.yml
```

- [x] **Step 3: Verify byte-identity**

Run: `diff <(gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d) .github/workflows/review-gate.yml && echo IDENTICAL; git hash-object .github/workflows/review-gate.yml`
Expected: `IDENTICAL`, then `d7ba2bd3ff18df42f3c710b3fe1bbfe2f2299a50` (if the upstream SHA has moved on, it must equal `gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .sha`).

- [x] **Step 4: Lint**

Run: `actionlint .github/workflows/review-gate.yml`
Expected: no output. Report any finding; don't edit the file.

- [x] **Step 5: Baseline checks**

Run: `make check < /dev/null`
Expected: typecheck clean, all tests pass.

- [x] **Step 6: Commit**

```bash
git add .github/workflows/review-gate.yml
git commit -m "ci: copy the status-based Review Gate from kindred-explore [TCP-1227]"
```

(After the PR is open and Autoreview has reviewed it, the status check in the spec's Goals proves the rest. Not part of this task.)
