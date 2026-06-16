import { NextRequest, NextResponse } from 'next/server';
import {
  assertValidCsrf,
  requireAuthenticatedWebSession,
} from '@acme-los/api/web-server';
import { getAccountSecurityAuthRequirement } from '../../../../../lib/application-auth';
import { maybeProxyToBff } from '../../../_lib/bff-route-proxy';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    await requireAuthenticatedWebSession(
      request,
      getAccountSecurityAuthRequirement('email'),
    );

    const proxiedResponse = await maybeProxyToBff(
      request,
      '/bff/account/security/email',
    );

    if (proxiedResponse) {
      return proxiedResponse;
    }

    return NextResponse.json(
      { error: 'Account email changes require the BFF MyAccount bridge.' },
      { status: 501 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to begin the email change.';

    return NextResponse.json({ error: message }, { status: 401 });
  }
}
