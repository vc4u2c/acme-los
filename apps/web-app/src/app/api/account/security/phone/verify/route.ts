import { NextRequest, NextResponse } from 'next/server';
import {
  assertValidCsrf,
  requireAuthenticatedWebSession,
  writePostChangeAuthIntent,
} from '@acme-los/api/web-server';
import { getAccountSecurityAuthRequirement } from '../../../../../../lib/application-auth';
import { proxyToBff } from '../../../../_lib/bff-route-proxy';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const session = await requireAuthenticatedWebSession(
      request,
      getAccountSecurityAuthRequirement('phone'),
    );
    const response = await proxyToBff(
      request,
      '/bff/account/security/phone/verify',
    );

    if (response.ok && session.user) {
      writePostChangeAuthIntent(request, response, {
        action: 'phone',
        expectedUserId: session.user.id,
      });
    }

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to verify the phone change.';

    return NextResponse.json({ error: message }, { status: 401 });
  }
}
