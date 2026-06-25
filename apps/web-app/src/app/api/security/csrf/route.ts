import { NextRequest, NextResponse } from 'next/server';
import { proxyToBff } from '../../_lib/bff-route-proxy';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyToBff(request, '/bff/security/csrf');
}
