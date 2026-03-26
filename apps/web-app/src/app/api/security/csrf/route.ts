import { NextRequest, NextResponse } from 'next/server';
import { issueCsrfToken, writeCsrfToken } from '@acme-los/api/web-server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const issuedToken = issueCsrfToken(request);
  const response = NextResponse.json(issuedToken.response);

  writeCsrfToken(request, response, issuedToken);

  return response;
}
