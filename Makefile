.PHONY: setup check

# Makes a fresh checkout or worktree ready to build and test. Idempotent.
setup:
	npm ci

# The baseline checks: typecheck, then the unit tests.
check:
	npm run typecheck
	npm test
