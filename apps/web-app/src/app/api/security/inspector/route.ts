import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  logAuthAuditEvent,
  readSecurityInspectorServerSnapshot,
  requireAuthenticatedWebSession,
} from '@acme-los/api/web-server';
import { isSecurityInspectorEnabled } from '../../../../lib/security-demo';

export const runtime = 'nodejs';

const securityInspectorRateLimitPolicy = {
  namespace: 'security-inspector',
  limit: 10,
  windowSeconds: 60,
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isSecurityInspectorEnabled()) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  }

  try {
    const rateLimit = await checkRateLimit(
      request,
      securityInspectorRateLimitPolicy,
    );

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { message: 'Too many security inspector requests.' },
        { status: 429 },
      );

      applyRateLimitHeaders(response, rateLimit);
      logAuthAuditEvent(request, {
        event: 'security.inspector',
        outcome: 'rate_limited',
        message: 'Security inspector rate limit exceeded.',
      });

      return response;
    }

    const session = await requireAuthenticatedWebSession(request);

    const response = NextResponse.json(
      await readSecurityInspectorServerSnapshot(request),
      {
        headers: {
          'cache-control': 'no-store, max-age=0',
        },
      },
    );

    applyRateLimitHeaders(response, rateLimit);
    logAuthAuditEvent(request, {
      event: 'security.inspector',
      outcome: 'success',
      message: 'Loaded security inspector snapshot.',
      session,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Authentication is required for this request.';

    logAuthAuditEvent(request, {
      event: 'security.inspector',
      outcome: 'failure',
      message,
    });

    return NextResponse.json({ message }, { status: 401 });
  }
}
