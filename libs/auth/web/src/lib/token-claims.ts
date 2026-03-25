'use client';

import { getWebAuthConfig } from './config';
import { getOktaAuthClient } from './okta-client';

export type OktaTokenClaimsSnapshot = {
  idToken: Record<string, unknown> | null;
  accessToken: Record<string, unknown> | null;
};

function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  try {
    return window.atob(`${normalized}${padding}`);
  } catch {
    return null;
  }
}

export function parseJwtClaims(
  token: string | undefined,
): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }

  const decodedPayload = decodeBase64Url(payload);
  if (!decodedPayload) {
    return null;
  }

  try {
    return JSON.parse(decodedPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getCurrentOktaTokenClaims(): Promise<OktaTokenClaimsSnapshot> {
  const config = getWebAuthConfig();
  if (config.provider !== 'okta' || !config.okta) {
    return { idToken: null, accessToken: null };
  }

  try {
    const response = await fetch('/api/auth/session?includeDebug=1', {
      credentials: 'same-origin',
      method: 'GET',
    });

    if (response.ok) {
      const serverSnapshot = (await response.json()) as {
        debug?: {
          idTokenClaims: Record<string, unknown> | null;
          accessTokenClaims: Record<string, unknown> | null;
        };
      };

      if (serverSnapshot.debug) {
        return {
          idToken: serverSnapshot.debug.idTokenClaims,
          accessToken: serverSnapshot.debug.accessTokenClaims,
        };
      }
    }
  } catch {
    // Fall back to the browser token manager when the server snapshot is not available.
  }

  try {
    const oktaAuth = getOktaAuthClient(config.okta);
    const tokens = await oktaAuth.tokenManager.getTokens();

    return {
      idToken: (tokens.idToken?.claims as Record<string, unknown>) ?? null,
      accessToken:
        ((
          tokens.accessToken as { claims?: Record<string, unknown> } | undefined
        )?.claims as Record<string, unknown> | undefined) ??
        parseJwtClaims(tokens.accessToken?.accessToken),
    };
  } catch {
    return { idToken: null, accessToken: null };
  }
}
