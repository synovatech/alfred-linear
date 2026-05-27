# Alfred Linear Workflow

A keyboard-driven [Alfred 5](https://alfredapp.com) workflow for searching, viewing, and creating [Linear](https://linear.app) issues — without leaving your keyboard.

## Features

- **Search** — `lin <query>` searches issues across your workspace with live results
- **View** — press `↩` on a result to see full issue detail: status, assignee, team, sub-issues, attachments, and description
- **Create** — `lin +TEAM title` creates a new issue and opens it in Linear
- **Open in browser** — press `↩` from the detail view to open the issue in Linear
- **Auth** — OAuth 2.0 PKCE (no client secret stored anywhere)

## Requirements

- macOS with Alfred 5 (Powerpack licence required)
- Node.js 20 or later
- A Linear account

## Installation

### 1. Clone and install

```bash
git clone https://github.com/your-org/alfred-linearis.git
cd alfred-linearis
npm install
```

### 2. Register a Linear OAuth application

1. In Linear, go to **Settings → API → OAuth Applications**
2. Create a new application
3. Set the redirect URI to exactly: `http://localhost:49201/callback`
4. Copy the **Client ID** — no client secret is needed (this workflow uses PKCE)

### 3. Set your Client ID

Edit `src/config.ts`:

```typescript
export const LINEAR_CLIENT_ID = 'your-client-id-here';
```

### 4. Build

```bash
npm run build
```

This compiles the TypeScript, bundles it with esbuild, and copies `workflow/info.plist` and `workflow/icon.png` into `workflow-folder/`.

### 5. Link the workflow folder to Alfred

`workflow-folder/` needs to point at a directory inside Alfred's workflow preferences. The recommended approach is a symlink so that `npm run build` writes directly into Alfred's live workflow:

```bash
PREFS="$HOME/Library/Application Support/Alfred/Alfred.alfredpreferences/workflows"
ln -s "$(pwd)/workflow-folder" "$PREFS/alfred-linearis"
```

Then open **Alfred Preferences → Workflows** — the "Linear actions" workflow should appear.

> **Already installed?** If Alfred created the workflow directory for you (e.g. after importing a `.alfredworkflow` file), find its UID in `~/Library/Application Support/Alfred/Alfred.alfredpreferences/workflows/` and point the symlink there instead:
> ```bash
> ln -s "$PREFS/user.workflow.XXXXXXXX-…" workflow-folder
> ```

### 6. Authenticate

In Alfred, type:

```
lin setup::auth
```

Your browser will open for Linear OAuth authorisation. Once you approve, a token is saved to `workflow-folder/auth.json` (mode 0600, git-ignored) and you're ready to go.

## Usage

| Alfred input | What happens |
|---|---|
| `lin <query>` | Live-search issues; results show status, assignee, and last-updated |
| `lin +TEAM title` | Preview creating an issue — e.g. `lin +TCP Fix the login bug` |
| `↩` on a search result | View full issue detail in Alfred's text viewer |
| `↩` on the detail view | Open the issue in Linear in your browser |
| `lin setup::auth` | Connect or re-connect your Linear account |

## Development

```bash
npm test          # 53 unit tests, no network calls
npm run build     # rebuild JS bundle and copy workflow assets
npm run sync      # pull Alfred UI edits back into workflow/ for committing
npm run typecheck # TypeScript type-check without emitting
```

### Project layout

```
src/
  index.ts          # entry point — arg parsing and command dispatch
  auth.ts           # OAuth 2.0 PKCE flow and token storage
  linear.ts         # LinearClient factory with automatic token refresh
  alfred.ts         # Alfred JSON output helpers
  config.ts         # Client ID, OAuth port, and scopes
  commands/
    search.ts       # issue search command
    detail.ts       # issue detail command
    create.ts       # issue creation command
tests/              # Vitest unit tests (all SDK calls mocked)
workflow/           # Tracked workflow assets — source of truth for the plist and icon
  info.plist        # Alfred workflow definition (nodes, connections, scripts)
  icon.png          # Workflow icon shown in Alfred
workflow-folder/    # Symlink → Alfred.alfredpreferences/workflows/…
  js/main.js        # Built bundle (git-ignored)
  auth.json         # OAuth tokens (git-ignored, mode 0600)
```

### Keeping `info.plist` in sync

When you edit the workflow in Alfred's visual editor, Alfred writes directly to `workflow-folder/info.plist`. To commit those changes, run:

```bash
npm run sync   # copies info.plist + icon.png from workflow-folder/ → workflow/
git add workflow/
git commit -m "chore: update workflow definition"
```

`npm run build` goes the other direction — it always overwrites `workflow-folder/` from `workflow/`, so commit before building if you have unsaved Alfred UI changes.

## Authentication details

- Tokens are stored in `workflow-folder/auth.json` (owner-read-only, git-ignored)
- Access tokens are refreshed automatically when within 5 minutes of expiry
- The refresh token is persisted across sessions
- To force re-authentication, delete `workflow-folder/auth.json` and run `lin setup::auth`

## Tech stack

| Concern | Tool |
|---|---|
| Language | TypeScript 5 |
| Linear API | `@linear/sdk` |
| Bundler | esbuild (single CJS file, ~2 MB, zero runtime deps) |
| Tests | Vitest |
| Runtime | Node.js 20 (bundled — no install required in the workflow) |
