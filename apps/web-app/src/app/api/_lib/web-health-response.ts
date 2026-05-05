import { NextResponse } from 'next/server';
import os from 'node:os';

export interface WebHealthSnapshot {
  status: 'ok';
  service: 'web-app';
  version: string;
  build: string | null;
  environment: string;
  instanceId: string;
  processId: number;
  servedAt: string;
}

export function createWebHealthSnapshot(): WebHealthSnapshot {
  const instanceId = os.hostname();
  const processId = process.pid;
  const servedAt = new Date().toISOString();

  return {
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
  };
}

export function createWebHealthResponse() {
  return NextResponse.json(createWebHealthSnapshot());
}
