import { NextRequest, NextResponse } from 'next/server';
import {
  assertValidCsrf,
  requireAuthenticatedWebSession,
} from '@acme-los/api/web-server';
import { proxyToBff } from '../../_lib/bff-route-proxy';
import { buildBffTrustedIdentityHeaders } from '../../_lib/bff-trusted-session';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuthenticatedWebSession(request);

    return proxyToBff(request, '/bff/customer/profile', {
      extraHeaders: buildBffTrustedIdentityHeaders(session),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Authentication is required.';

    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const session = await requireAuthenticatedWebSession(request);

    return proxyToBff(request, '/bff/customer/profile', {
      extraHeaders: buildBffTrustedIdentityHeaders(session),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to update the customer profile.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
