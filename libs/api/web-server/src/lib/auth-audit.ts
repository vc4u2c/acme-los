import type { WebAuthSession } from '@acme-los/api/contracts';
import { createConsoleLogger } from '@acme-los/core/logger';
import type { NextRequest } from 'next/server';
import { getRequestClientAddress, getRequestUserAgent } from './request-meta';

const logger = createConsoleLogger();

type AuthAuditOutcome = 'success' | 'failure' | 'rate_limited';

type AuthAuditEvent =
  | 'auth.idx.start'
  | 'auth.idx.post_change.start'
  | 'auth.idx.complete'
  | 'auth.session.touch'
  | 'auth.session.clear'
  | 'auth.logout'
  | 'customer.profile.email_changed'
  | 'security.inspector';

export function logAuthAuditEvent(
  request: NextRequest,
  {
    event,
    outcome,
    message,
    session,
    metadata,
  }: {
    event: AuthAuditEvent;
    outcome: AuthAuditOutcome;
    message?: string;
    session?: WebAuthSession | null;
    metadata?: Record<string, unknown>;
  },
): void {
  const logMethod =
    outcome === 'success'
      ? logger.info
      : outcome === 'rate_limited'
        ? logger.warn
        : logger.error;

  logMethod(event, {
    audit: true,
    event,
    outcome,
    route: request.nextUrl.pathname,
    method: request.method,
    clientAddress: getRequestClientAddress(request),
    userAgent: getRequestUserAgent(request),
    sessionUserId: session?.user?.id,
    sessionLeadId: session?.user?.leadId,
    assuranceLevel: session?.assuranceLevel,
    message,
    ...metadata,
  });
}
