import { NextRequest, NextResponse } from 'next/server';
import os from 'node:os';
import { maybeProxyToBff } from '../_lib/bff-route-proxy';

export async function GET(request: NextRequest) {
  const proxiedResponse = await maybeProxyToBff(request, '/bff/health');

  if (proxiedResponse) {
    return proxiedResponse;
  }

  const instanceId = os.hostname();
  const processId = process.pid;
  const servedAt = new Date().toISOString();

  return NextResponse.json({
    status: 'ok',
    service: 'web-app',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
    build:
      process.env.APP_BUILD_ID ?? process.env.NEXT_PUBLIC_APP_BUILD ?? null,
    environment:
      process.env.APP_ENVIRONMENT_NAME ??
      process.env.NEXT_PUBLIC_APP_ENVIRONMENT ??
      'local',
    instanceId,
    processId,
    servedAt,
  });
}
