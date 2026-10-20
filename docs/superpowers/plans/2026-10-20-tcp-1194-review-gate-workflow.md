---
linear: TCP-1194
---

# TCP-1194 Review Gate Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the org-standard Review Gate workflow verbatim, and list the repo's Linear project in `CLAUDE.md`.

**Architecture:** One GitHub Actions workflow file copied byte-for-byte from `synovatech/kindred-explore` `main`; one two-line doc addition. No source code changes.

**Tech Stack:** GitHub Actions, `gh` CLI, `actionlint` + ShellCheck.

**Spec:** `docs/superpowers/specs/2026-10-20-tcp-1194-review-gate-workflow-design.md`

## Global Constraints

- The workflow file must be byte-identical to `synovatech/kindred-explore` `main`'s `.github/workflows/review-gate.yml` (SHA-256 `debe5dd41587a24b4abfabde678895a8cbd418c65dbd59287f16b326ba17d639` as of 2026-10-20). No edits, no reformatting.
- Fetch it via the contents API and base64-decode; never retype it.
- Every commit message ends with the `Co-authored-by:` line given in the implementer prompt.

## Review Focus

- Trailing newline / line endings drift when copying: the `diff` and the SHA-256 both catch it.
- Live kindred-explore `main` changed since the spec: if the live SHA differs from the pinned one, use the live copy (the ticket's check is against live `main`) and report the drift.
- Other `.github/` content accidentally added (e.g. a test or lint workflow): out of scope; `git status` must show only the one new file in Task 1.

---

### Task 1: Add the Review Gate workflow

**Files:**
- Create: `.github/workflows/review-gate.yml`

- [x] **Step 1: Confirm it's missing**

Run: `test -e .github/workflows/review-gate.yml; echo $?`
Expected: `1`

- [x] **Step 2: Copy it from kindred-explore `main`**

```bash
mkdir -p .github/workflows
gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d > .github/workflows/review-gate.yml
```

- [x] **Step 3: Verify byte-identical**

Run: `diff <(gh api repos/synovatech/kindred-explore/contents/.github/workflows/review-gate.yml --jq .content | base64 -d) .github/workflows/review-gate.yml && shasum -a256 .github/workflows/review-gate.yml`
Expected: no diff output; SHA-256 `debe5dd4…d639` (if different, report the drift).

- [x] **Step 4: Lint**

Run: `actionlint .github/workflows/review-gate.yml` (ShellCheck on PATH)
Expected: no output, exit 0.

- [x] **Step 5: Commit**

```bash
git add .github/workflows/review-gate.yml
git commit -m "ci: add the Review Gate workflow required by the org ruleset [TCP-1194]"
```

### Task 2: List the Linear project in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (insert between the `## Commands` code block and `## Repository layout`)

- [ ] **Step 1: Insert exactly**

```markdown
## Linear
- Project: Alfred Linear — https://linear.app/synovatech/project/alfred-linear-9e8ed2cbcc32
```

followed by a blank line before `## Repository layout`.

- [ ] **Step 2: Verify**

Run: `grep -n -A1 '^## Linear$' CLAUDE.md && npm run typecheck && npm test`
Expected: the heading and project line print; typecheck clean; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: list the Alfred Linear project for Autofix [TCP-1194]"
```
