import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { applicationStepKeys } from '@acme-los/api/contracts';
import {
  assertValidCsrf,
  clearApplicationFlow,
  requireAuthenticatedWebSession,
  submitApplicationFlow,
} from '@acme-los/api/web-server';
import { getApplicationAuthRequirement } from '../../../../lib/application-auth';

export const runtime = 'nodejs';

const submitApplicationSchema = z.object({
  step: z.enum(applicationStepKeys),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const payload = submitApplicationSchema.parse(await request.json());
    const session = await requireAuthenticatedWebSession(
      request,
      getApplicationAuthRequirement(payload.step),
    );
    const submitResponse = await submitApplicationFlow(session, payload);
    const response = NextResponse.json(submitResponse);

    await clearApplicationFlow(session, request, response);

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to submit the application.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
