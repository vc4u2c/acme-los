import type { WebAuthSession } from '@acme-los/api/contracts';

const BFF_AUTHENTICATED_USER_ID_HEADER = 'x-acme-authenticated-user-id';
const BFF_AUTHENTICATED_USER_EMAIL_HEADER = 'x-acme-authenticated-user-email';
const BFF_AUTH_PROVIDER_HEADER = 'x-acme-auth-provider';
const BFF_AUTHENTICATED_CUSTOMER_ID_HEADER = 'x-acme-authenticated-customer-id';
const BFF_AUTHENTICATED_LEAD_ID_HEADER = 'x-acme-authenticated-lead-id';

export function buildBffTrustedIdentityHeaders(
  session: WebAuthSession,
): Record<string, string | undefined> {
  return {
    [BFF_AUTH_PROVIDER_HEADER]: session.provider,
    [BFF_AUTHENTICATED_USER_ID_HEADER]: session.user?.id,
    [BFF_AUTHENTICATED_USER_EMAIL_HEADER]: session.user?.email,
    [BFF_AUTHENTICATED_CUSTOMER_ID_HEADER]: session.user?.customerId,
    [BFF_AUTHENTICATED_LEAD_ID_HEADER]: session.user?.leadId,
  };
}
