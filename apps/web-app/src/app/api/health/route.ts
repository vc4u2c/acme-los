import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web-app',
    environment:
      process.env.APP_ENVIRONMENT_NAME ??
      process.env.NEXT_PUBLIC_APP_ENVIRONMENT ??
      'local',
  });
}
