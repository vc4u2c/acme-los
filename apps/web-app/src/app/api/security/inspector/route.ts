import { NextRequest, NextResponse } from 'next/server';
import {
  readSecurityInspectorServerSnapshot,
  requireAuthenticatedWebSession,
} from '@acme-los/api/web-server';
import { isSecurityInspectorEnabled } from '../../../../lib/security-demo';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isSecurityInspectorEnabled()) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  }

  try {
    await requireAuthenticatedWebSession(request);

    return NextResponse.json(
      await readSecurityInspectorServerSnapshot(request),
      {
        headers: {
          'cache-control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Authentication is required for this request.';

    return NextResponse.json({ message }, { status: 401 });
  }
}
