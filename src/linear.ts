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
