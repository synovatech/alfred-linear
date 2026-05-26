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
