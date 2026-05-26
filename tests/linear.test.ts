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
