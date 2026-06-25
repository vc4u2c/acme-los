import { NextRequest, NextResponse } from 'next/server';
import {
  assertValidCsrf,
  requireAuthenticatedWebSession,
} from '@acme-los/api/web-server';
import { getAccountSecurityAuthRequirement } from '../../../../../lib/application-auth';
import { proxyToBff } from '../../../_lib/bff-route-proxy';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    await requireAuthenticatedWebSession(
      request,
      getAccountSecurityAuthRequirement('password'),
    );

    return proxyToBff(request, '/bff/account/security/password');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to change the password.';

    return NextResponse.json({ error: message }, { status: 401 });
  }
}
