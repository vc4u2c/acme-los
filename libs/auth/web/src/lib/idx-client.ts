'use client';

import { OktaAuth } from '@okta/okta-auth-js';

export type IdxBrowserTransactionConfig = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
};

export function createIdxAuthClient(
  config: IdxBrowserTransactionConfig,
): OktaAuth {
  return new OktaAuth({
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
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
        storageType: 'sessionStorage',
      },
    },
    tokenManager: {
      storage: 'memory',
      autoRenew: false,
      autoRemove: true,
    },
  });
}
