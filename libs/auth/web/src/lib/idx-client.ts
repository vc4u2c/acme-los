'use client';

import { OktaAuth } from '@okta/okta-auth-js';

export type IdxBrowserTransactionConfig = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  acrValues?: string | null;
  maxAgeSeconds?: number | null;
};

export function createIdxAuthClient(
  config: IdxBrowserTransactionConfig,
): OktaAuth {
  return new OktaAuth({
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    state: config.state,
    // Auth JS reads server-owned PKCE from constructor options, not idx.start.
    codeChallenge: config.codeChallenge,
    codeChallengeMethod: config.codeChallengeMethod,
    acrValues: config.acrValues ?? undefined,
    // The SDK's interact request omits numeric zero; its supported string form preserves it.
    maxAge: config.maxAgeSeconds?.toString(),
    pkce: true,
    idx: {
      exchangeCodeForTokens: false,
    },
    storageManager: {
      token: {
        storageType: 'memory',
      },
      cache: {
        storageType: 'memory',
      },
      transaction: {
        storageType: 'memory',
      },
    },
    tokenManager: {
      storage: 'memory',
      autoRenew: false,
      autoRemove: true,
    },
  });
}
