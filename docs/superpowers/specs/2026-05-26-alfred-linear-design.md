# Alfred Linear Workflow — Design Spec

_Created: 2026-05-26_

## Overview

An Alfred 5 workflow that integrates with Linear via the `@linear/sdk`. Phase 1 covers issue search, issue detail, and issue creation. Authentication uses OAuth 2.0 with PKCE — no manual API key handling.

---

## Technology Stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety for growing feature set; matches Linear SDK |
| Linear integration | `@linear/sdk` directly | Single process, full control, no linearis subprocess overhead |
| Bundler | esbuild | Compiles TS + deps into one self-contained file; ~100ms build |
| Auth | OAuth 2.0 PKCE | Future-proof; no static secrets; auto-refresh |
| Node.js | 20+ | Runtime for distributed bundle |
| Distribution | `.alfredworkflow` export | Standard Alfred distribution format |

---

## Project Structure

```
alfred-linearis/                ← repo root
├── src/
│   ├── index.ts                ← entry point: parses query, dispatches command
│   ├── commands/
│   │   ├── search.ts           ← search issues → Alfred JSON
│   │   ├── detail.ts           ← fetch single issue → Markdown text
│   │   └── create.ts           ← create issue → URL
│   ├── alfred.ts               ← Alfred JSON type definitions and item builders
│   ├── linear.ts               ← @linear/sdk client singleton, reads from auth.json
│   └── auth.ts                 ← OAuth PKCE flow: login, token storage, auto-refresh
├── package.json
├── tsconfig.json
├── .gitignore
└── workflow-folder/            ← symlink → Alfred preferences workflow directory
    ├── js/
    │   └── main.js             ← esbuild output: all src + deps bundled (gitignored)
    ├── info.plist              ← Alfred workflow definition
    ├── icon.png
    └── auth.json               ← OAuth tokens: access_token, refresh_token, expires_at (gitignored)
```

**`.gitignore`:**
```
node_modules/
workflow-folder/js/
workflow-folder/auth.json
```

esbuild compiles `src/index.ts` → `workflow-folder/js/main.js`. All `@linear/sdk` code is inlined — no `node_modules` in the workflow folder. Distributed users need only Node.js installed (via `brew install node`).

---

## CLI Interface

The Alfred Script Filter bash script (embedded in `info.plist`) calls:

```bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
node "$DIR/js/main.js" "$1"
```

The entry point (`index.ts`) reads `auth.json` first on every invocation. If missing or tokens are expired and unrefreshable, it returns the unauthenticated Alfred JSON and exits.

### Modes

| Invocation | Mode | Triggered by |
|---|---|---|
| `node js/main.js "<query>"` | Search or create-preview | Alfred Script Filter (main) |
| `node js/main.js --detail "<issueId>"` | Issue detail text | Alfred Text View script source |
| `node js/main.js --create "<encoded>"` | Create issue | Alfred Run Script node |
| `node js/main.js --auth` | OAuth PKCE flow | Alfred Run Script node (setup path) |

### Query parsing

- Default: **search mode** — query passed to `@linear/sdk` issue search
- **Create mode** — triggered when query matches `^\+[A-Z]{2,5}\s+.+` (e.g. `+KIN Fix auth bug`)

The `+TEAMCODE` prefix is unambiguous and avoids false positives from search queries that happen to contain uppercase words.

### Alfred JSON output shapes

**Search — multiple results:**
```json
{
  "items": [
    {
      "uid": "KIN-123",
      "title": "KIN-123  Fix authentication bug",
      "subtitle": "In Progress · Adam Horner · updated 2 days ago",
      "arg": "KIN-123",
      "variables": { "url": "https://linear.app/kindred/issue/KIN-123", "issueId": "KIN-123" },
      "match": "KIN-123 fix authentication bug in progress adam"
    }
  ]
}
```

**Search — single result** (richer subtitle, same routing):
```json
{
  "items": [
    {
      "uid": "KIN-123",
      "title": "KIN-123  Fix authentication bug",
      "subtitle": "In Progress · Adam Horner · Fix the JWT token expiry handling in the auth middleware…",
      "arg": "KIN-123",
      "variables": { "url": "https://linear.app/kindred/issue/KIN-123", "issueId": "KIN-123" }
    }
  ]
}
```

**Create preview** (while user is typing `+KIN Fix auth bug`):
```json
{
  "items": [
    {
      "uid": "create",
      "title": "Create in KIN: Fix auth bug",
      "subtitle": "Press Enter to create and open in Linear",
      "arg": "create::KIN::Fix auth bug"
    }
  ]
}
```

**Unauthenticated:**
```json
{
  "items": [
    {
      "title": "Linear: Not connected",
      "subtitle": "Press Enter to connect your Linear account",
      "arg": "setup::auth"
    }
  ]
}
```

---

## Alfred Workflow Structure

```
[Script Filter: lin {query}]
        ↓ arg
[Conditional]
    ├── matches ^setup::
    │       ↓
    │   [Run Script: node js/main.js --auth]      OAuth PKCE flow, writes auth.json
    │       (done — user re-invokes lin to proceed)
    │
    ├── matches ^create::
    │       ↓
    │   [Run Script: node js/main.js --create {query}]   creates issue, outputs URL
    │       ↓ stdout = URL
    │   [Open URL]
    │
    └── else  (arg = issue ID, e.g. "KIN-123")
            ↓
        [Text View]                    script source: node js/main.js --detail {var:issueId}
            ↓ user presses Enter
        [Open URL: {var:url}]          URL carried via Alfred variable set in Script Filter item
```

**Notes:**
- Alfred variables (`url`, `issueId`) set on Script Filter items persist through the entire downstream chain.
- The Text View uses **Script Source** mode, calling `node js/main.js --detail "{var:issueId}"` directly. It outputs Markdown for Alfred to render.
- The final Open URL node uses `{var:url}` — not the Text View's output — so the URL is never lost regardless of what text passes through.
- `--auth` Run Script blocks while the user completes OAuth in the browser (local HTTP server awaiting callback). Alfred shows the workflow as running. Typical duration: 5–15 seconds.

---

## Authentication

### OAuth 2.0 PKCE flow

Linear supports OAuth 2.0 PKCE for public clients (no client secret required).

**Prerequisites:**
- A Linear OAuth application registered under the Synova account (one-time setup by the developer, not each user)
- `client_id` baked into the distributed bundle — safe, not a secret

**Flow (`--auth` command):**

1. Generate `code_verifier` (random 64-byte base64url string) and `code_challenge` (SHA-256 of verifier)
2. Start a temporary local HTTP server on a random available port
3. Open browser to Linear's auth endpoint:
   ```
   https://linear.app/oauth/authorize
     ?client_id=<CLIENT_ID>
     &redirect_uri=http://127.0.0.1:{port}/callback
     &response_type=code
     &scope=read,write,issues:create
     &code_challenge=<CHALLENGE>
     &code_challenge_method=S256
   ```
4. User approves in browser → Linear redirects to `http://127.0.0.1:{port}/callback?code=...`
5. Local server catches the code, exchanges it for tokens at `/oauth/token`
6. Writes `workflow-folder/auth.json`:
   ```json
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_at": 1234567890000
   }
   ```
7. Browser shows "Connected! You can close this tab." Server closes.
8. `--auth` process exits cleanly.

**Token refresh:**

`linear.ts` checks `expires_at` before each API call. If within 5 minutes of expiry, it silently POSTs to `/oauth/token` with the refresh token and updates `auth.json`. If refresh fails (revoked), it deletes `auth.json` so the next invocation shows the setup item again.

Access tokens expire after 24 hours; refresh tokens are long-lived.

---

## First-Run Setup

No Terminal involvement. Everything happens within Alfred and the browser.

1. User types `lin` — tool detects missing `auth.json` → returns "Not connected" item
2. User presses Enter → Alfred Conditional routes to `--auth` Run Script
3. Browser opens automatically (step 3 of PKCE flow above)
4. User clicks "Authorize" in Linear
5. Browser shows success, Alfred's Run Script exits
6. User types `lin` again — authenticated, results appear

For developer setup (cloning the repo), a short `README.md` covers the additional steps: `npm install` and `npm run build` at the repo root before the workflow is functional.

---

## Phase 1 Scope

| Feature | Status |
|---|---|
| OAuth 2.0 PKCE authentication | In scope |
| Auto token refresh | In scope |
| Search issues by query | In scope |
| Issue detail in Text View | In scope |
| Open issue in browser | In scope |
| Single-result enriched subtitle | In scope |
| Create issue with `+TEAM title` | In scope |
| esbuild bundle + gitignore setup | In scope |

---

## Future Phases

- Search for projects, teams, views; display issues within them
- List projects, teams, users
- Create projects
- Alfred workflow variables for default team, project, assignee (`userconfigurationconfig` in `info.plist`)
- Move issues through statuses
- Assign issues to people
- Full multi-step action menus (sub-results for a selected issue)
