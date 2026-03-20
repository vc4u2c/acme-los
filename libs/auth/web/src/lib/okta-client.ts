'use client';

import { OktaAuth } from '@okta/okta-auth-js';
import type { OktaBrowserAuthConfig } from './config';

let oktaAuthClient: OktaAuth | null = null;
let oktaAuthCacheKey: string | null = null;

export function getOktaAuthClient(config: OktaBrowserAuthConfig): OktaAuth {
  const cacheKey = `${config.issuer}|${config.clientId}|${config.redirectUri}`;

  if (!oktaAuthClient || oktaAuthCacheKey !== cacheKey) {
    oktaAuthClient = new OktaAuth({
      issuer: config.issuer,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      pkce: true,
      tokenManager: {
        storage: 'sessionStorage',
        autoRenew: true,
        autoRemove: true,
      },
      postLogoutRedirectUri: config.postLogoutRedirectUri,
    });
    oktaAuthCacheKey = cacheKey;
  }

  return oktaAuthClient;
}
