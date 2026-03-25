import { NextRequest, NextResponse } from 'next/server';
import { getWebAuthConfig } from '@acme-los/auth/web';
import {
  clearWebAuthSession,
  readLogoutHintIdToken,
} from '../../../../server/web-api/auth-session';

export const runtime = 'nodejs';

function getSafePostLogoutRedirectUri(request: NextRequest): string {
  const config = getWebAuthConfig();

  if (config.provider !== 'okta' || !config.okta) {
    return new URL('/', request.url).toString();
  }

  return config.okta.postLogoutRedirectUri;
}

function buildOktaLogoutUrl(idToken: string): string | null {
  const config = getWebAuthConfig();

  if (config.provider !== 'okta' || !config.okta) {
    return null;
  }

  const issuerUrl = new URL(config.okta.issuer);
  const logoutUrl = new URL(
    `${issuerUrl.pathname.replace(/\/+$/, '')}/v1/logout`,
    `${issuerUrl.origin}/`,
  );

  logoutUrl.searchParams.set('id_token_hint', idToken);
  logoutUrl.searchParams.set(
    'post_logout_redirect_uri',
    config.okta.postLogoutRedirectUri,
  );

  return logoutUrl.toString();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const idToken = readLogoutHintIdToken(request);
  const fallbackRedirectUri = getSafePostLogoutRedirectUri(request);
  const logoutDestination = idToken
    ? (buildOktaLogoutUrl(idToken) ?? fallbackRedirectUri)
    : fallbackRedirectUri;
  const response = NextResponse.redirect(logoutDestination);

  clearWebAuthSession(request, response);

  return response;
}
