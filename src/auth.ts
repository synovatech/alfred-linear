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
  fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
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
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      server.close();
      fn();
    };

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost');

      if (url.pathname !== '/callback') {
        res.writeHead(200);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');

      if (!code) {
        res.writeHead(400);
        res.end('Missing code parameter');
        settle(() => reject(new Error('No code in OAuth callback')));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Connected to Linear!</h1><p>You can close this tab.</p></body></html>');

      try {
        const tokens = await exchangeCode(code, verifier, clientId);
        writeTokens(tokens, filePath);
        settle(resolve);
      } catch (err) {
        settle(() => reject(err));
      }
    });

    server.on('error', (err) => settle(() => reject(err)));

    server.listen(OAUTH_CALLBACK_PORT, 'localhost', () => {
      const authUrl = buildAuthUrl(clientId, challenge);
      exec(`open "${authUrl}"`);
      console.error(`Opening browser for Linear authorisation…`);
    });

    setTimeout(() => {
      settle(() => reject(new Error('OAuth flow timed out after 5 minutes')));
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
