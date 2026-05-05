import { NextResponse } from 'next/server';
import os from 'node:os';

export function createWebHealthResponse() {
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
