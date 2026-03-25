import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  clearWebAuthSession,
  readWebAuthSession,
  syncWebAuthSession,
  writeWebAuthSession,
} from '../../../../server/web-api/auth-session';
import { assertValidCsrf } from '../../../../server/web-api/csrf';

export const runtime = 'nodejs';

const syncSessionSchema = z.object({
  idToken: z.string().min(1),
  leadId: z.string().trim().min(1).optional(),
  accessTokenClaims: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const includeDebug = request.nextUrl.searchParams.get('includeDebug') === '1';

  return NextResponse.json(readWebAuthSession(request, { includeDebug }));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);

    const payload = syncSessionSchema.parse(await request.json());
    const syncedSession = await syncWebAuthSession(payload);
    const response = NextResponse.json(syncedSession.response);

    writeWebAuthSession(request, response, syncedSession);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to sync auth session.';

    return NextResponse.json(
      {
        session: {
          provider: 'okta',
          status: 'error',
          isAuthenticated: false,
          assuranceLevel: 'anonymous',
          user: null,
          errorMessage: message,
        },
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);

    const response = NextResponse.json({
      cleared: true,
      session: {
        provider: 'okta',
        status: 'unauthenticated',
        isAuthenticated: false,
        assuranceLevel: 'anonymous',
        user: null,
      },
    });

    clearWebAuthSession(request, response);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to clear auth session.';

    return NextResponse.json(
      {
        cleared: false,
        session: {
          provider: 'okta',
          status: 'error',
          isAuthenticated: false,
          assuranceLevel: 'anonymous',
          user: null,
          errorMessage: message,
        },
      },
      { status: 400 },
    );
  }
}
