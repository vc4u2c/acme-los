import { NextRequest, NextResponse } from 'next/server';
import {
  clearWebAuthLogoutArtifacts,
  getServerWebAuthConfig,
  readLogoutHintIdToken,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

function getSafePostLogoutRedirectUri(request: NextRequest): string {
  const config = getServerWebAuthConfig();

  if (config.provider !== 'okta' || !config.okta) {
    return new URL('/', request.url).toString();
  }

  return config.okta.postLogoutRedirectUri;
}

function readIssuerFromIdToken(idToken: string): string | null {
  const [, payload] = idToken.split('.');
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded =
      normalized.length % 4 === 0
        ? normalized
        : `${normalized}${'='.repeat(4 - (normalized.length % 4))}`;
    const decoded = JSON.parse(
      Buffer.from(padded, 'base64').toString('utf8'),
    ) as { iss?: unknown };

    return typeof decoded.iss === 'string' ? decoded.iss : null;
  } catch {
    return null;
  }
}

function buildOktaLogoutUrl(idToken: string): string | null {
  const config = getServerWebAuthConfig();

  if (config.provider !== 'okta' || !config.okta) {
    return null;
  }

  const configuredIssuer = new URL(config.okta.issuer);
  const tokenIssuer = readIssuerFromIdToken(idToken);
  const issuer =
    configuredIssuer.hostname.endsWith('.okta.com') && tokenIssuer
      ? tokenIssuer
      : config.okta.issuer;
  const issuerUrl = new URL(issuer);
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
  const idToken = await readLogoutHintIdToken(request);
  const fallbackRedirectUri = getSafePostLogoutRedirectUri(request);
  const logoutDestination = idToken
    ? (buildOktaLogoutUrl(idToken) ?? fallbackRedirectUri)
    : fallbackRedirectUri;
  const response = NextResponse.redirect(logoutDestination);

  await clearWebAuthLogoutArtifacts(request, response);

  return response;
}
