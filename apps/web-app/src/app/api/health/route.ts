import { NextRequest } from 'next/server';
import { maybeProxyToBff } from '../_lib/bff-route-proxy';
import { createWebHealthResponse } from '../_lib/web-health-response';

export async function GET(request: NextRequest) {
  const proxiedResponse = await maybeProxyToBff(request, '/bff/health');

  if (proxiedResponse) {
    return proxiedResponse;
  }

  return createWebHealthResponse();
}
