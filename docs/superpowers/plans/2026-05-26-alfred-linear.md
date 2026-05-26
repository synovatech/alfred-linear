# Alfred Linear Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI tool that powers an Alfred 5 workflow for searching, viewing, and creating Linear issues using OAuth 2.0 PKCE authentication.

**Architecture:** esbuild bundles `src/` into `workflow-folder/js/main.js`. Alfred's Script Filter calls `node js/main.js "$1"`; the entry point checks auth, parses the query, and dispatches to search/detail/create command modules. OAuth tokens live in `workflow-folder/auth.json` (gitignored). Command functions return values; only the entry point writes to stdout.

**Tech Stack:** TypeScript 5, `@linear/sdk`, esbuild, Vitest, Node.js 20+

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | Constants: `LINEAR_CLIENT_ID`, `OAUTH_CALLBACK_PORT`, scopes |
| `src/alfred.ts` | Alfred JSON types; item builder functions |
| `src/auth.ts` | OAuth PKCE flow; token read/write/refresh |
| `src/linear.ts` | `getClient()` — creates a `LinearClient` with auto-refresh |
| `src/commands/search.ts` | Search issues → `AlfredItem[]` |
| `src/commands/detail.ts` | Fetch issue detail → Markdown string |
| `src/commands/create.ts` | Parse encoded arg, create issue → URL string |
| `src/index.ts` | Entry point: arg parsing, auth check, dispatch, stdout |
| `build.mjs` | esbuild script: `src/index.ts` → `workflow-folder/js/main.js` |
| `workflow-folder/info.plist` | Alfred workflow definition with all nodes and connections |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.mts`
- Create: `build.mjs`
- Create: `src/config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "alfred-linear",
  "version": "1.0.0",
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@linear/sdk": "*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "*",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "workflow-folder", "tests"]
}
```

- [ ] **Step 3: Write `vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write `build.mjs`**

```javascript
import * as esbuild from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(__dirname, 'workflow-folder/js/main.js'),
  external: [],
});

console.log('Built: workflow-folder/js/main.js');
```

- [ ] **Step 5: Write `src/config.ts`**

Replace `YOUR_CLIENT_ID` after registering the OAuth application in Linear (Settings → API → OAuth Applications). The `client_id` is not a secret and is safe to commit.

```typescript
export const LINEAR_CLIENT_ID = 'YOUR_CLIENT_ID';
export const OAUTH_CALLBACK_PORT = 49201;
export const OAUTH_SCOPES = 'read,write,issues:create';
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
workflow-folder/js/
workflow-folder/auth.json
dist/
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.mts build.mjs src/config.ts .gitignore
git commit -m "feat: project scaffolding — package.json, tsconfig, esbuild, vitest"
```

---

## Task 2: Alfred JSON Types and Item Builders

**Files:**
- Create: `src/alfred.ts`
- Create: `tests/alfred.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/alfred.test.ts
import { describe, it, expect } from 'vitest';
import {
  makeSearchItem,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
  alfredOutput,
} from '../src/alfred';

describe('makeSearchItem', () => {
  const issue = {
    id: 'abc',
    identifier: 'KIN-1',
    title: 'Fix auth bug',
    url: 'https://linear.app/kindred/issue/KIN-1',
    description: 'JWT token expires too quickly in the middleware',
    updatedAt: '2026-05-20T10:00:00.000Z',
    state: { name: 'In Progress' },
    assignee: { displayName: 'Adam Horner' },
  };

  it('sets uid to identifier', () => {
    const item = makeSearchItem(issue, false);
    expect(item.uid).toBe('KIN-1');
  });

  it('formats title with identifier and issue title', () => {
    const item = makeSearchItem(issue, false);
    expect(item.title).toBe('KIN-1  Fix auth bug');
  });

  it('sets arg to identifier', () => {
    const item = makeSearchItem(issue, false);
    expect(item.arg).toBe('KIN-1');
  });

  it('carries url and issueId in variables', () => {
    const item = makeSearchItem(issue, false);
    expect(item.variables?.url).toBe('https://linear.app/kindred/issue/KIN-1');
    expect(item.variables?.issueId).toBe('KIN-1');
  });

  it('multi-result subtitle shows status, assignee, and relative date', () => {
    const item = makeSearchItem(issue, false);
    expect(item.subtitle).toContain('In Progress');
    expect(item.subtitle).toContain('Adam Horner');
  });

  it('single-result subtitle shows description excerpt instead of date', () => {
    const item = makeSearchItem(issue, true);
    expect(item.subtitle).toContain('JWT token expires');
  });

  it('single-result subtitle truncates description at 80 chars', () => {
    const longDesc = 'A'.repeat(120);
    const item = makeSearchItem({ ...issue, description: longDesc }, true);
    expect(item.subtitle!.length).toBeLessThan(130);
    expect(item.subtitle).toContain('…');
  });
});

describe('makeSetupItem', () => {
  it('returns item with setup::auth arg', () => {
    const item = makeSetupItem();
    expect(item.arg).toBe('setup::auth');
    expect(item.title).toContain('Not connected');
  });
});

describe('makeCreatePreviewItem', () => {
  it('encodes team and title into arg', () => {
    const item = makeCreatePreviewItem('KIN', 'Fix auth bug');
    expect(item.arg).toBe('create::KIN::Fix auth bug');
    expect(item.title).toContain('KIN');
    expect(item.title).toContain('Fix auth bug');
  });
});

describe('makeEmptyQueryItem', () => {
  it('returns a non-actionable prompt item', () => {
    const item = makeEmptyQueryItem();
    expect(item.valid).toBe(false);
  });
});

describe('alfredOutput', () => {
  it('serialises items array to JSON on stdout', () => {
    const written: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (data: any) => { written.push(String(data)); return true; };

    alfredOutput([makeSetupItem()]);

    process.stdout.write = originalWrite;
    const parsed = JSON.parse(written.join(''));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].arg).toBe('setup::auth');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: `Cannot find module '../src/alfred'`

- [ ] **Step 3: Implement `src/alfred.ts`**

```typescript
export interface AlfredItem {
  uid?: string;
  title: string;
  subtitle?: string;
  arg?: string;
  valid?: boolean;
  variables?: Record<string, string>;
  match?: string;
  icon?: { path?: string; type?: string };
  text?: { copy?: string; largetype?: string };
  quicklookurl?: string;
}

export interface IssueShape {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string | null;
  updatedAt: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
}

export function makeSearchItem(issue: IssueShape, isSingle: boolean): AlfredItem {
  const status = issue.state?.name ?? 'Unknown';
  const assignee = issue.assignee?.displayName ?? 'Unassigned';

  const subtitle = isSingle && issue.description
    ? `${status} · ${assignee} · ${issue.description.slice(0, 80)}${issue.description.length > 80 ? '…' : ''}`
    : `${status} · ${assignee} · updated ${relativeDate(issue.updatedAt)}`;

  return {
    uid: issue.identifier,
    title: `${issue.identifier}  ${issue.title}`,
    subtitle,
    arg: issue.identifier,
    variables: { url: issue.url, issueId: issue.identifier },
    match: `${issue.identifier} ${issue.title} ${status} ${assignee}`.toLowerCase(),
  };
}

export function makeSetupItem(): AlfredItem {
  return {
    title: 'Linear: Not connected',
    subtitle: 'Press Enter to connect your Linear account',
    arg: 'setup::auth',
  };
}

export function makeCreatePreviewItem(team: string, title: string): AlfredItem {
  return {
    uid: 'create',
    title: `Create in ${team}: ${title}`,
    subtitle: 'Press Enter to create and open in Linear',
    arg: `create::${team}::${title}`,
  };
}

export function makeEmptyQueryItem(): AlfredItem {
  return {
    title: 'Search Linear issues…',
    subtitle: 'Type a search term',
    valid: false,
  };
}

export function alfredOutput(items: AlfredItem[]): void {
  process.stdout.write(JSON.stringify({ items }));
}

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test
```

Expected: all `tests/alfred.test.ts` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/alfred.ts tests/alfred.test.ts
git commit -m "feat: Alfred JSON types and item builders"
```

---

## Task 3: Auth Token Storage

**Files:**
- Create: `src/auth.ts` (token I/O portion only)
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readTokens,
  writeTokens,
  deleteTokens,
  isExpiringSoon,
  generateCodeVerifier,
  generateCodeChallenge,
  type AuthTokens,
} from '../src/auth';

const tmpFile = path.join(os.tmpdir(), 'alfred-linear-test-auth.json');

const validTokens: AuthTokens = {
  access_token: 'tok_abc',
  refresh_token: 'ref_xyz',
  expires_at: Date.now() + 60 * 60 * 1000, // 1 hour from now
};

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
});

describe('readTokens', () => {
  it('returns null when file does not exist', () => {
    expect(readTokens(tmpFile)).toBeNull();
  });

  it('returns parsed tokens when file exists', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(validTokens));
    const result = readTokens(tmpFile);
    expect(result?.access_token).toBe('tok_abc');
  });

  it('returns null when file contains invalid JSON', () => {
    fs.writeFileSync(tmpFile, 'not-json');
    expect(readTokens(tmpFile)).toBeNull();
  });
});

describe('writeTokens', () => {
  it('writes tokens as formatted JSON', () => {
    writeTokens(validTokens, tmpFile);
    const raw = fs.readFileSync(tmpFile, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.access_token).toBe('tok_abc');
  });
});

describe('deleteTokens', () => {
  it('removes the auth file', () => {
    fs.writeFileSync(tmpFile, JSON.stringify(validTokens));
    deleteTokens(tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('does not throw when file does not exist', () => {
    expect(() => deleteTokens(tmpFile)).not.toThrow();
  });
});

describe('isExpiringSoon', () => {
  it('returns true when token expires in less than 5 minutes', () => {
    const tokens = { ...validTokens, expires_at: Date.now() + 2 * 60 * 1000 };
    expect(isExpiringSoon(tokens)).toBe(true);
  });

  it('returns false when token expires in more than 5 minutes', () => {
    const tokens = { ...validTokens, expires_at: Date.now() + 10 * 60 * 1000 };
    expect(isExpiringSoon(tokens)).toBe(false);
  });

  it('returns true when token is already expired', () => {
    const tokens = { ...validTokens, expires_at: Date.now() - 1000 };
    expect(isExpiringSoon(tokens)).toBe(true);
  });
});

describe('generateCodeVerifier', () => {
  it('returns a base64url string of at least 43 characters', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique values each time', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('generateCodeChallenge', () => {
  it('returns base64url SHA-256 of verifier', () => {
    // SHA-256('abc') base64url = ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0
    const challenge = generateCodeChallenge('abc');
    expect(challenge).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: `Cannot find module '../src/auth'`

- [ ] **Step 3: Implement token storage and PKCE helpers in `src/auth.ts`**

```typescript
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { OAUTH_CALLBACK_PORT, OAUTH_SCOPES } from './config';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export const DEFAULT_AUTH_FILE = path.join(__dirname, '..', 'auth.json');

export function readTokens(filePath = DEFAULT_AUTH_FILE): AuthTokens | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AuthTokens;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: AuthTokens, filePath = DEFAULT_AUTH_FILE): void {
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2));
}

export function deleteTokens(filePath = DEFAULT_AUTH_FILE): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

export function isExpiringSoon(tokens: AuthTokens): boolean {
  return tokens.expires_at - Date.now() < 5 * 60 * 1000;
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// OAuth flow functions are added in Task 4
export async function refreshTokens(
  tokens: AuthTokens,
  clientId: string,
  filePath = DEFAULT_AUTH_FILE,
): Promise<AuthTokens | null> {
  try {
    const res = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    const refreshed: AuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    writeTokens(refreshed, filePath);
    return refreshed;
  } catch {
    return null;
  }
}

export async function startOAuthFlow(clientId: string, filePath = DEFAULT_AUTH_FILE): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      const code = url.searchParams.get('code');

      if (!code) {
        res.writeHead(400);
        res.end('Missing code parameter');
        server.close();
        reject(new Error('No code in OAuth callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Connected to Linear!</h1><p>You can close this tab.</p></body></html>');
      server.close();

      try {
        const tokens = await exchangeCode(code, verifier, clientId);
        writeTokens(tokens, filePath);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    server.on('error', reject);

    server.listen(OAUTH_CALLBACK_PORT, 'localhost', () => {
      const authUrl = buildAuthUrl(clientId, challenge);
      exec(`open "${authUrl}"`);
      console.error(`Opening browser for Linear authorisation…`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth flow timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

function buildAuthUrl(clientId: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `http://localhost:${OAUTH_CALLBACK_PORT}/callback`,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://linear.app/oauth/authorize?${params}`;
}

async function exchangeCode(code: string, verifier: string, clientId: string): Promise<AuthTokens> {
  const res = await fetch('https://api.linear.app/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `http://localhost:${OAUTH_CALLBACK_PORT}/callback`,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test
```

Expected: all `tests/auth.test.ts` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: auth token storage, PKCE helpers, and OAuth flow"
```

---

## Task 4: Linear SDK Client

**Files:**
- Create: `src/linear.ts`
- Create: `tests/linear.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/linear.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/auth', () => ({
  readTokens: vi.fn(),
  refreshTokens: vi.fn(),
  deleteTokens: vi.fn(),
  isExpiringSoon: vi.fn(),
}));

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({ _mocked: true })),
}));

import { readTokens, refreshTokens, deleteTokens, isExpiringSoon } from '../src/auth';
import { LinearClient } from '@linear/sdk';
import { getClient } from '../src/linear';

const validTokens = {
  access_token: 'tok_abc',
  refresh_token: 'ref_xyz',
  expires_at: Date.now() + 60 * 60 * 1000,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getClient', () => {
  it('throws when no tokens exist', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    await expect(getClient()).rejects.toThrow('Not authenticated');
  });

  it('returns a LinearClient when tokens are valid', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(isExpiringSoon).mockReturnValue(false);
    const client = await getClient();
    expect(LinearClient).toHaveBeenCalledWith({ accessToken: 'tok_abc' });
    expect(client).toBeDefined();
  });

  it('refreshes tokens when expiring soon', async () => {
    const refreshed = { ...validTokens, access_token: 'tok_new' };
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(isExpiringSoon).mockReturnValue(true);
    vi.mocked(refreshTokens).mockResolvedValue(refreshed);
    await getClient();
    expect(LinearClient).toHaveBeenCalledWith({ accessToken: 'tok_new' });
  });

  it('deletes tokens and throws when refresh fails', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(isExpiringSoon).mockReturnValue(true);
    vi.mocked(refreshTokens).mockResolvedValue(null);
    await expect(getClient()).rejects.toThrow('Token refresh failed');
    expect(deleteTokens).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- tests/linear.test.ts
```

Expected: `Cannot find module '../src/linear'`

- [ ] **Step 3: Implement `src/linear.ts`**

```typescript
import { LinearClient } from '@linear/sdk';
import {
  readTokens,
  refreshTokens,
  deleteTokens,
  isExpiringSoon,
} from './auth';
import { LINEAR_CLIENT_ID } from './config';

export async function getClient(): Promise<LinearClient> {
  let tokens = readTokens();

  if (!tokens) {
    throw new Error('Not authenticated');
  }

  if (isExpiringSoon(tokens)) {
    const refreshed = await refreshTokens(tokens, LINEAR_CLIENT_ID);
    if (!refreshed) {
      deleteTokens();
      throw new Error('Token refresh failed — please re-authenticate by running lin');
    }
    tokens = refreshed;
  }

  return new LinearClient({ accessToken: tokens.access_token });
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- tests/linear.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/linear.ts tests/linear.test.ts
git commit -m "feat: Linear SDK client with auto token refresh"
```

---

## Task 5: Search Command

**Files:**
- Create: `src/commands/search.ts`
- Create: `tests/commands/search.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { searchIssues } from '../../src/commands/search';
import type { AlfredItem } from '../../src/alfred';

function makeMockIssue(overrides = {}) {
  return {
    id: 'abc',
    identifier: 'KIN-1',
    title: 'Fix auth bug',
    url: 'https://linear.app/kindred/issue/KIN-1',
    description: 'JWT token expires too quickly',
    updatedAt: new Date('2026-05-20'),
    state: Promise.resolve({ name: 'In Progress' }),
    assignee: Promise.resolve({ displayName: 'Adam Horner' }),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('searchIssues', () => {
  it('returns empty-result item when no issues found', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({ nodes: [] }),
    } as any);
    const items = await searchIssues('nomatch');
    expect(items).toHaveLength(1);
    expect(items[0].valid).toBe(false);
    expect(items[0].title).toContain('No results');
  });

  it('returns one item per issue', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({
        nodes: [makeMockIssue(), makeMockIssue({ identifier: 'KIN-2', id: 'def' })],
      }),
    } as any);
    const items = await searchIssues('auth');
    expect(items).toHaveLength(2);
  });

  it('enriches subtitle when single result', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({ nodes: [makeMockIssue()] }),
    } as any);
    const items = await searchIssues('auth');
    expect(items[0].subtitle).toContain('JWT token');
  });

  it('uses brief subtitle when multiple results', async () => {
    vi.mocked(getClient).mockResolvedValue({
      searchIssues: vi.fn().mockResolvedValue({
        nodes: [makeMockIssue(), makeMockIssue({ identifier: 'KIN-2', id: 'def' })],
      }),
    } as any);
    const items = await searchIssues('auth');
    expect(items[0].subtitle).not.toContain('JWT token');
    expect(items[0].subtitle).toContain('In Progress');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- tests/commands/search.test.ts
```

Expected: `Cannot find module '../../src/commands/search'`

- [ ] **Step 3: Implement `src/commands/search.ts`**

```typescript
import { getClient } from '../linear';
import { makeSearchItem, type AlfredItem, type IssueShape } from '../alfred';

export async function searchIssues(query: string): Promise<AlfredItem[]> {
  const client = await getClient();
  const result = await client.searchIssues(query, { first: 10 });

  if (result.nodes.length === 0) {
    return [{ title: `No results for "${query}"`, subtitle: 'Try a different search term', valid: false }];
  }

  const isSingle = result.nodes.length === 1;

  return Promise.all(
    result.nodes.map(async (issue) => {
      const [state, assignee] = await Promise.all([issue.state, issue.assignee]);
      const shape: IssueShape = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: issue.description,
        updatedAt: issue.updatedAt.toISOString(),
        state: state ? { name: state.name } : null,
        assignee: assignee ? { displayName: assignee.displayName } : null,
      };
      return makeSearchItem(shape, isSingle);
    }),
  );
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- tests/commands/search.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/search.ts tests/commands/search.test.ts
git commit -m "feat: search issues command"
```

---

## Task 6: Detail Command

**Files:**
- Create: `src/commands/detail.ts`
- Create: `tests/commands/detail.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/detail.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { getIssueDetail } from '../../src/commands/detail';

function makeMockIssue(overrides = {}) {
  return {
    identifier: 'KIN-1',
    title: 'Fix auth bug',
    url: 'https://linear.app/kindred/issue/KIN-1',
    description: 'JWT token expires too quickly in the middleware.',
    updatedAt: new Date('2026-05-20'),
    createdAt: new Date('2026-05-10'),
    state: Promise.resolve({ name: 'In Progress' }),
    assignee: Promise.resolve({ displayName: 'Adam Horner' }),
    team: Promise.resolve({ name: 'Kindred' }),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('getIssueDetail', () => {
  it('includes identifier and title in heading', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue()),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('# KIN-1');
    expect(md).toContain('Fix auth bug');
  });

  it('includes status, assignee, and team', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue()),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('In Progress');
    expect(md).toContain('Adam Horner');
    expect(md).toContain('Kindred');
  });

  it('includes description body', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue()),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('JWT token expires');
  });

  it('shows placeholder when description is absent', async () => {
    vi.mocked(getClient).mockResolvedValue({
      issue: vi.fn().mockResolvedValue(makeMockIssue({ description: null })),
    } as any);
    const md = await getIssueDetail('KIN-1');
    expect(md).toContain('No description');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- tests/commands/detail.test.ts
```

Expected: `Cannot find module '../../src/commands/detail'`

- [ ] **Step 3: Implement `src/commands/detail.ts`**

```typescript
import { getClient } from '../linear';

export async function getIssueDetail(identifier: string): Promise<string> {
  const client = await getClient();
  const issue = await client.issue(identifier);

  const [state, assignee, team] = await Promise.all([
    issue.state,
    issue.assignee,
    issue.team,
  ]);

  return [
    `# ${issue.identifier}: ${issue.title}`,
    '',
    `**Status:** ${state?.name ?? 'Unknown'}`,
    `**Assignee:** ${assignee?.displayName ?? 'Unassigned'}`,
    `**Team:** ${team?.name ?? 'Unknown'}`,
    `**Updated:** ${issue.updatedAt.toLocaleDateString('en-GB')}`,
    '',
    issue.description?.trim() || '_No description_',
    '',
    `[Open in Linear](${issue.url})`,
  ].join('\n');
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- tests/commands/detail.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/detail.ts tests/commands/detail.test.ts
git commit -m "feat: issue detail command — Markdown output for Alfred Text View"
```

---

## Task 7: Create Command

**Files:**
- Create: `src/commands/create.ts`
- Create: `tests/commands/create.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/create.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/linear', () => ({ getClient: vi.fn() }));

import { getClient } from '../../src/linear';
import { createIssue, parseCreateArg } from '../../src/commands/create';

beforeEach(() => { vi.clearAllMocks(); });

describe('parseCreateArg', () => {
  it('extracts team and title from encoded arg', () => {
    const result = parseCreateArg('create::KIN::Fix auth bug');
    expect(result).toEqual({ team: 'KIN', title: 'Fix auth bug' });
  });

  it('handles titles containing double colons', () => {
    const result = parseCreateArg('create::KIN::Fix::colons::in title');
    expect(result).toEqual({ team: 'KIN', title: 'Fix::colons::in title' });
  });

  it('returns null for malformed arg', () => {
    expect(parseCreateArg('create::KIN')).toBeNull();
    expect(parseCreateArg('notcreate::KIN::title')).toBeNull();
  });
});

describe('createIssue', () => {
  it('resolves team by key and creates issue', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      issue: Promise.resolve({ url: 'https://linear.app/kindred/issue/KIN-2' }),
    });
    vi.mocked(getClient).mockResolvedValue({
      teams: vi.fn().mockResolvedValue({
        nodes: [{ id: 'team-id-1', key: 'KIN' }],
      }),
      createIssue: mockCreate,
    } as any);

    const url = await createIssue('create::KIN::Fix auth bug');
    expect(mockCreate).toHaveBeenCalledWith({ teamId: 'team-id-1', title: 'Fix auth bug' });
    expect(url).toBe('https://linear.app/kindred/issue/KIN-2');
  });

  it('throws when team key is not found', async () => {
    vi.mocked(getClient).mockResolvedValue({
      teams: vi.fn().mockResolvedValue({ nodes: [{ id: 'x', key: 'TCP' }] }),
    } as any);
    await expect(createIssue('create::KIN::title')).rejects.toThrow('Team KIN not found');
  });

  it('throws for malformed encoded arg', async () => {
    await expect(createIssue('create::KIN')).rejects.toThrow('Invalid create argument');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- tests/commands/create.test.ts
```

Expected: `Cannot find module '../../src/commands/create'`

- [ ] **Step 3: Implement `src/commands/create.ts`**

```typescript
import { getClient } from '../linear';

interface CreateArg {
  team: string;
  title: string;
}

export function parseCreateArg(encoded: string): CreateArg | null {
  if (!encoded.startsWith('create::')) return null;
  const rest = encoded.slice('create::'.length);
  const sepIdx = rest.indexOf('::');
  if (sepIdx === -1) return null;
  return {
    team: rest.slice(0, sepIdx),
    title: rest.slice(sepIdx + 2),
  };
}

export async function createIssue(encoded: string): Promise<string> {
  const parsed = parseCreateArg(encoded);
  if (!parsed) throw new Error(`Invalid create argument: ${encoded}`);

  const client = await getClient();
  const teams = await client.teams();
  const team = teams.nodes.find((t) => t.key === parsed.team.toUpperCase());

  if (!team) throw new Error(`Team ${parsed.team} not found`);

  const result = await client.createIssue({ teamId: team.id, title: parsed.title });
  const issue = await result.issue;

  if (!issue) throw new Error('Issue creation returned no issue');

  return issue.url;
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- tests/commands/create.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/create.ts tests/commands/create.test.ts
git commit -m "feat: create issue command"
```

---

## Task 8: Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/auth', () => ({
  readTokens: vi.fn(),
  startOAuthFlow: vi.fn(),
  DEFAULT_AUTH_FILE: '/tmp/test-auth.json',
}));
vi.mock('../src/commands/search', () => ({ searchIssues: vi.fn() }));
vi.mock('../src/commands/detail', () => ({ getIssueDetail: vi.fn() }));
vi.mock('../src/commands/create', () => ({ createIssue: vi.fn() }));
vi.mock('../src/alfred', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/alfred')>();
  return { ...actual, alfredOutput: vi.fn() };
});

import { readTokens } from '../src/auth';
import { searchIssues } from '../src/commands/search';
import { getIssueDetail } from '../src/commands/detail';
import { createIssue } from '../src/commands/create';
import { alfredOutput, makeSetupItem, makeCreatePreviewItem } from '../src/alfred';
import { parseQuery, runMain } from '../src/index';

const validTokens = {
  access_token: 'tok',
  refresh_token: 'ref',
  expires_at: Date.now() + 3600_000,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('parseQuery', () => {
  it('returns search mode for plain text', () => {
    expect(parseQuery('fix auth bug')).toEqual({ mode: 'search', query: 'fix auth bug' });
  });

  it('returns create mode for +TEAM prefix', () => {
    expect(parseQuery('+KIN Fix auth bug')).toEqual({ mode: 'create', team: 'KIN', title: 'Fix auth bug' });
  });

  it('returns empty mode for blank query', () => {
    expect(parseQuery('')).toEqual({ mode: 'empty' });
    expect(parseQuery('  ')).toEqual({ mode: 'empty' });
  });

  it('returns search mode for lowercase input even if first word is uppercase-ish', () => {
    expect(parseQuery('fix KIN bug')).toEqual({ mode: 'search', query: 'fix KIN bug' });
  });

  it('create pattern requires at least one title word after team', () => {
    expect(parseQuery('+KIN')).toEqual({ mode: 'search', query: '+KIN' });
  });
});

describe('runMain (script filter mode)', () => {
  it('outputs setup item when not authenticated', async () => {
    vi.mocked(readTokens).mockReturnValue(null);
    await runMain([]);
    expect(alfredOutput).toHaveBeenCalledWith([makeSetupItem()]);
  });

  it('calls searchIssues and outputs results for plain query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    vi.mocked(searchIssues).mockResolvedValue([{ title: 'KIN-1  Fix auth', arg: 'KIN-1' }]);
    await runMain(['fix auth']);
    expect(searchIssues).toHaveBeenCalledWith('fix auth');
    expect(alfredOutput).toHaveBeenCalled();
  });

  it('outputs create preview for +TEAM query', async () => {
    vi.mocked(readTokens).mockReturnValue(validTokens);
    await runMain(['+KIN Fix auth bug']);
    expect(alfredOutput).toHaveBeenCalledWith([makeCreatePreviewItem('KIN', 'Fix auth bug')]);
    expect(searchIssues).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- tests/index.test.ts
```

Expected: `Cannot find module '../src/index'`

- [ ] **Step 3: Implement `src/index.ts`**

```typescript
import { readTokens, startOAuthFlow } from './auth';
import { getIssueDetail } from './commands/detail';
import { createIssue } from './commands/create';
import { searchIssues } from './commands/search';
import {
  alfredOutput,
  makeSetupItem,
  makeCreatePreviewItem,
  makeEmptyQueryItem,
} from './alfred';
import { LINEAR_CLIENT_ID } from './config';

type ParsedQuery =
  | { mode: 'search'; query: string }
  | { mode: 'create'; team: string; title: string }
  | { mode: 'empty' };

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim();
  if (!q) return { mode: 'empty' };
  const createMatch = q.match(/^\+([A-Z]{2,5})\s+(.+)$/);
  if (createMatch) return { mode: 'create', team: createMatch[1], title: createMatch[2] };
  return { mode: 'search', query: q };
}

export async function runMain(args: string[]): Promise<void> {
  // Flag-based dispatch (called from Alfred Run Script nodes, not Script Filter)
  if (args[0] === '--auth') {
    await startOAuthFlow(LINEAR_CLIENT_ID);
    return;
  }

  if (args[0] === '--detail') {
    const md = await getIssueDetail(args[1]);
    process.stdout.write(md);
    return;
  }

  if (args[0] === '--create') {
    const url = await createIssue(args[1]);
    process.stdout.write(url);
    return;
  }

  // Script Filter invocation
  if (!readTokens()) {
    alfredOutput([makeSetupItem()]);
    return;
  }

  const parsed = parseQuery(args[0] ?? '');

  if (parsed.mode === 'empty') {
    alfredOutput([makeEmptyQueryItem()]);
    return;
  }

  if (parsed.mode === 'create') {
    alfredOutput([makeCreatePreviewItem(parsed.team, parsed.title)]);
    return;
  }

  const items = await searchIssues(parsed.query);
  alfredOutput(items);
}

if (require.main === module) {
  runMain(process.argv.slice(2)).catch((err) => {
    alfredOutput([{ title: 'Error', subtitle: String(err?.message ?? err), valid: false }]);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test
```

Expected: all tests across all test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: entry point — arg parsing, auth check, command dispatch"
```

---

## Task 9: Build and Alfred Workflow Nodes

**Files:**
- Modify: `workflow-folder/info.plist`

- [ ] **Step 1: Build the bundle**

```bash
npm run build
```

Expected output: `Built: workflow-folder/js/main.js`

Verify the file exists:
```bash
ls -lh workflow-folder/js/main.js
```

Expected: file exists, size ~1–3 MB.

- [ ] **Step 2: Test the CLI manually**

First, verify the unauthenticated response:
```bash
node workflow-folder/js/main.js "test query"
```

Expected output (formatted):
```json
{"items":[{"title":"Linear: Not connected","subtitle":"Press Enter to connect your Linear account","arg":"setup::auth"}]}
```

- [ ] **Step 3: Update `workflow-folder/info.plist` with all workflow nodes**

Replace the entire `info.plist` with the following. The `connections` section wires all nodes together. Node UIDs are fixed so they are stable across machines.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>bundleid</key>
	<string>tech.synova.linear</string>
	<key>category</key>
	<string>Productivity</string>
	<key>connections</key>
	<dict>
		<key>1ADCC1A3-30C2-4E05-A59A-632715499D15</key>
		<array>
			<dict>
				<key>destinationuid</key>
				<string>AA000001-0000-0000-0000-000000000001</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>modifiersubtext</key>
				<string></string>
				<key>vitoclose</key>
				<false/>
			</dict>
		</array>
		<key>AA000001-0000-0000-0000-000000000001</key>
		<array>
			<dict>
				<key>destinationuid</key>
				<string>AA000002-0000-0000-0000-000000000002</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>modifiersubtext</key>
				<string></string>
				<key>vitoclose</key>
				<false/>
			</dict>
			<dict>
				<key>destinationuid</key>
				<string>AA000003-0000-0000-0000-000000000003</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>modifiersubtext</key>
				<string></string>
				<key>vitoclose</key>
				<false/>
			</dict>
			<dict>
				<key>destinationuid</key>
				<string>AA000004-0000-0000-0000-000000000004</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>modifiersubtext</key>
				<string></string>
				<key>vitoclose</key>
				<false/>
			</dict>
		</array>
		<key>AA000003-0000-0000-0000-000000000003</key>
		<array>
			<dict>
				<key>destinationuid</key>
				<string>AA000005-0000-0000-0000-000000000005</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>modifiersubtext</key>
				<string></string>
				<key>vitoclose</key>
				<false/>
			</dict>
		</array>
		<key>AA000004-0000-0000-0000-000000000004</key>
		<array>
			<dict>
				<key>destinationuid</key>
				<string>AA000006-0000-0000-0000-000000000006</string>
				<key>modifiers</key>
				<integer>0</integer>
				<key>modifiersubtext</key>
				<string></string>
				<key>vitoclose</key>
				<false/>
			</dict>
		</array>
	</dict>
	<key>createdby</key>
	<string>Adam Horner</string>
	<key>description</key>
	<string>Find, view, and create Linear issues and projects</string>
	<key>disabled</key>
	<false/>
	<key>name</key>
	<string>Linear actions</string>
	<key>objects</key>
	<array>
		<!-- Script Filter (existing, keyword: lin) -->
		<dict>
			<key>config</key>
			<dict>
				<key>alfredfiltersresults</key>
				<false/>
				<key>alfredfiltersresultsmatchmode</key>
				<integer>0</integer>
				<key>argumenttreatemptyqueryasnil</key>
				<true/>
				<key>argumenttrimmode</key>
				<integer>0</integer>
				<key>argumenttype</key>
				<integer>0</integer>
				<key>escaping</key>
				<integer>102</integer>
				<key>keyword</key>
				<string>lin</string>
				<key>queuedelaycustom</key>
				<integer>3</integer>
				<key>queuedelayimmediatelyinitially</key>
				<true/>
				<key>queuedelaymode</key>
				<integer>0</integer>
				<key>queuemode</key>
				<integer>1</integer>
				<key>runningsubtext</key>
				<string>Searching Linear…</string>
				<key>script</key>
				<string>DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &amp;&amp; pwd )"
node "$DIR/js/main.js" "$1"</string>
				<key>scriptargtype</key>
				<integer>1</integer>
				<key>scriptfile</key>
				<string></string>
				<key>subtext</key>
				<string>Search and create Linear issues</string>
				<key>title</key>
				<string>Linear…</string>
				<key>type</key>
				<integer>11</integer>
				<key>withspace</key>
				<true/>
			</dict>
			<key>type</key>
			<string>alfred.workflow.input.scriptfilter</string>
			<key>uid</key>
			<string>1ADCC1A3-30C2-4E05-A59A-632715499D15</string>
			<key>version</key>
			<integer>3</integer>
		</dict>
		<!-- Conditional: routes setup:: → auth, create:: → create, else → detail -->
		<dict>
			<key>config</key>
			<dict>
				<key>conditions</key>
				<array>
					<dict>
						<key>inputstring</key>
						<string>{query}</string>
						<key>matchcasesensitive</key>
						<false/>
						<key>matchmode</key>
						<integer>2</integer>
						<key>matchstring</key>
						<string>setup::</string>
						<key>outputlabel</key>
						<string>auth</string>
					</dict>
					<dict>
						<key>inputstring</key>
						<string>{query}</string>
						<key>matchcasesensitive</key>
						<false/>
						<key>matchmode</key>
						<integer>2</integer>
						<key>matchstring</key>
						<string>create::</string>
						<key>outputlabel</key>
						<string>create</string>
					</dict>
				</array>
				<key>elseoutputlabel</key>
				<string>detail</string>
			</dict>
			<key>type</key>
			<string>alfred.workflow.utility.conditional</string>
			<key>uid</key>
			<string>AA000001-0000-0000-0000-000000000001</string>
			<key>version</key>
			<integer>1</integer>
		</dict>
		<!-- Run Script: --auth (OAuth flow) -->
		<dict>
			<key>config</key>
			<dict>
				<key>concurrently</key>
				<false/>
				<key>escaping</key>
				<integer>0</integer>
				<key>script</key>
				<string>DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &amp;&amp; pwd )"
node "$DIR/js/main.js" --auth</string>
				<key>scriptargtype</key>
				<integer>0</integer>
				<key>scriptfile</key>
				<string></string>
				<key>type</key>
				<integer>0</integer>
			</dict>
			<key>type</key>
			<string>alfred.workflow.action.script</string>
			<key>uid</key>
			<string>AA000002-0000-0000-0000-000000000002</string>
			<key>version</key>
			<integer>2</integer>
		</dict>
		<!-- Run Script: --create {query} -->
		<dict>
			<key>config</key>
			<dict>
				<key>concurrently</key>
				<false/>
				<key>escaping</key>
				<integer>0</integer>
				<key>script</key>
				<string>DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &amp;&amp; pwd )"
node "$DIR/js/main.js" --create "{query}"</string>
				<key>scriptargtype</key>
				<integer>1</integer>
				<key>scriptfile</key>
				<string></string>
				<key>type</key>
				<integer>0</integer>
			</dict>
			<key>type</key>
			<string>alfred.workflow.action.script</string>
			<key>uid</key>
			<string>AA000003-0000-0000-0000-000000000003</string>
			<key>version</key>
			<integer>2</integer>
		</dict>
		<!-- Text View: shows issue detail (script source) -->
		<dict>
			<key>config</key>
			<dict>
				<key>behaviour</key>
				<integer>0</integer>
				<key>content</key>
				<string></string>
				<key>contenttype</key>
				<integer>2</integer>
				<key>escaping</key>
				<integer>0</integer>
				<key>script</key>
				<string>DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &amp;&amp; pwd )"
node "$DIR/js/main.js" --detail "{var:issueId}"</string>
				<key>scriptargtype</key>
				<integer>0</integer>
				<key>source</key>
				<integer>2</integer>
			</dict>
			<key>type</key>
			<string>alfred.workflow.output.text</string>
			<key>uid</key>
			<string>AA000004-0000-0000-0000-000000000004</string>
			<key>version</key>
			<integer>1</integer>
		</dict>
		<!-- Open URL: from create flow (stdout = URL) -->
		<dict>
			<key>config</key>
			<dict>
				<key>browser</key>
				<string></string>
				<key>skipquoting</key>
				<false/>
				<key>url</key>
				<string>{query}</string>
			</dict>
			<key>type</key>
			<string>alfred.workflow.action.openurl</string>
			<key>uid</key>
			<string>AA000005-0000-0000-0000-000000000005</string>
			<key>version</key>
			<integer>1</integer>
		</dict>
		<!-- Open URL: from detail flow (variable = url) -->
		<dict>
			<key>config</key>
			<dict>
				<key>browser</key>
				<string></string>
				<key>skipquoting</key>
				<false/>
				<key>url</key>
				<string>{var:url}</string>
			</dict>
			<key>type</key>
			<string>alfred.workflow.action.openurl</string>
			<key>uid</key>
			<string>AA000006-0000-0000-0000-000000000006</string>
			<key>version</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>readme</key>
	<string></string>
	<key>uidata</key>
	<dict>
		<key>1ADCC1A3-30C2-4E05-A59A-632715499D15</key>
		<dict>
			<key>xpos</key>
			<real>60</real>
			<key>ypos</key>
			<real>250</real>
		</dict>
		<key>AA000001-0000-0000-0000-000000000001</key>
		<dict>
			<key>xpos</key>
			<real>260</real>
			<key>ypos</key>
			<real>250</real>
		</dict>
		<key>AA000002-0000-0000-0000-000000000002</key>
		<dict>
			<key>xpos</key>
			<real>460</real>
			<key>ypos</key>
			<real>100</real>
		</dict>
		<key>AA000003-0000-0000-0000-000000000003</key>
		<dict>
			<key>xpos</key>
			<real>460</real>
			<key>ypos</key>
			<real>200</real>
		</dict>
		<key>AA000004-0000-0000-0000-000000000004</key>
		<dict>
			<key>xpos</key>
			<real>460</real>
			<key>ypos</key>
			<real>320</real>
		</dict>
		<key>AA000005-0000-0000-0000-000000000005</key>
		<dict>
			<key>xpos</key>
			<real>660</real>
			<key>ypos</key>
			<real>200</real>
		</dict>
		<key>AA000006-0000-0000-0000-000000000006</key>
		<dict>
			<key>xpos</key>
			<real>660</real>
			<key>ypos</key>
			<real>320</real>
		</dict>
	</dict>
	<key>userconfigurationconfig</key>
	<array/>
	<key>webaddress</key>
	<string>https://www.synova.tech/</string>
</dict>
</plist>
```

> **Note:** Alfred's Conditional node connection ordering maps array position to condition index (0 = setup::, 1 = create::, 2 = else/detail). If the workflow connections don't behave as expected after loading in Alfred, open Alfred Preferences → Workflows → Linear, verify the Conditional outputs are wired correctly, and re-save. Alfred will rewrite the plist with its own formatting; that is expected.

- [ ] **Step 4: Commit**

```bash
git add workflow-folder/info.plist
git commit -m "feat: Alfred workflow nodes — Conditional, Run Scripts, Text View, Open URL"
```

---

## Task 10: Register Linear OAuth Application and End-to-End Verification

- [ ] **Step 1: Register the OAuth application in Linear**

1. Open Linear → Settings → API → OAuth Applications → Create Application
2. Set:
   - **Name:** Alfred Linear
   - **Redirect URI:** `http://localhost:49201/callback`
   - **Actor:** User (not workspace)
3. Copy the **Client ID**
4. Open `src/config.ts` and replace `YOUR_CLIENT_ID`:

```typescript
export const LINEAR_CLIENT_ID = 'paste-your-client-id-here';
```

5. Rebuild:

```bash
npm run build
```

- [ ] **Step 2: Run the OAuth flow**

```bash
node workflow-folder/js/main.js --auth
```

Expected:
- Terminal prints `Opening browser for Linear authorisation…`
- Browser opens to Linear's OAuth page
- After approval, browser shows "Connected to Linear!"
- Terminal exits cleanly

- [ ] **Step 3: Verify authentication persisted**

```bash
cat workflow-folder/auth.json
```

Expected: JSON with `access_token`, `refresh_token`, `expires_at`.

- [ ] **Step 4: Test search**

```bash
node workflow-folder/js/main.js "some issue title"
```

Expected: JSON output with `items` array containing Linear issues.

- [ ] **Step 5: Test detail**

Pick an identifier from the search output (e.g., `KIN-1`):

```bash
node workflow-folder/js/main.js --detail "KIN-1"
```

Expected: Markdown text with issue heading, status, assignee, description.

- [ ] **Step 6: Test create preview**

```bash
node workflow-folder/js/main.js "+KIN Test issue from CLI"
```

Expected: JSON with a single item, title containing "Create in KIN: Test issue from CLI".

- [ ] **Step 7: Test in Alfred**

1. Open Alfred and type `lin` — should show "Search Linear issues…"
2. Type `lin fix auth` — should show matching issues
3. Select an issue — Text View should open with Markdown detail
4. Press Enter — issue should open in browser
5. Type `lin +KIN Test issue` — should show create preview
6. Press Enter — issue should be created and open in browser

- [ ] **Step 8: Commit config with client ID and final build**

```bash
git add src/config.ts
git commit -m "feat: register Linear OAuth app and complete Phase 1 setup"
```
