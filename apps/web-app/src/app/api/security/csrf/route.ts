import { NextRequest, NextResponse } from 'next/server';
import { issueCsrfToken, writeCsrfToken } from '@acme-los/api/web-server';
import { maybeProxyToBff } from '../../_lib/bff-route-proxy';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const proxiedResponse = await maybeProxyToBff(request, '/bff/security/csrf');

  if (proxiedResponse) {
    return proxiedResponse;
  }

  const issuedToken = issueCsrfToken(request);
  const response = NextResponse.json(issuedToken.response);

  writeCsrfToken(request, response, issuedToken);

  return response;
}
