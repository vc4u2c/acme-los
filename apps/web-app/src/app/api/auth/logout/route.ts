import { NextRequest, NextResponse } from 'next/server';
import {
  buildPublicRequestUrl,
  clearWebAuthLogoutArtifacts,
  getServerWebAuthConfig,
  logAuthAuditEvent,
  readPostChangeAuthIntent,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

function getSafePostLogoutRedirectUri(request: NextRequest): string {
  const config = getServerWebAuthConfig();

  if (config.provider !== 'okta' || !config.okta) {
    return buildPublicRequestUrl(request, '/').toString();
  }

  if (readPostChangeAuthIntent(request)) {
    return new URL(
      '/account/sign-in',
      config.okta.postLogoutRedirectUri,
    ).toString();
  }

  return config.okta.postLogoutRedirectUri;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const fallbackRedirectUri = getSafePostLogoutRedirectUri(request);
    const response = NextResponse.redirect(fallbackRedirectUri);
    const logout = await clearWebAuthLogoutArtifacts(
      request,
      response,
      fallbackRedirectUri,
    );

    if (logout?.logoutUrl) {
      response.headers.set('location', logout.logoutUrl);
    }
    logAuthAuditEvent(request, {
      event: 'auth.logout',
      outcome: 'success',
      message: 'Redirected through server-side logout.',
      metadata: {
        usedOktaLogout: logout?.usedOktaLogout ?? false,
      },
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to complete sign-out.';

    logAuthAuditEvent(request, {
      event: 'auth.logout',
      outcome: 'failure',
      message,
    });

    return NextResponse.redirect(getSafePostLogoutRedirectUri(request));
  }
}
