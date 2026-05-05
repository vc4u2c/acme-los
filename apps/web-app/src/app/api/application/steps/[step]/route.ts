import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import {
  applicationStepKeys,
  type ApplicationStepKey,
} from '@acme-los/api/contracts';
import {
  assertValidCsrf,
  readApplicationStepState,
  requireAuthenticatedWebSession,
  saveApplicationStep,
} from '@acme-los/api/web-server';
import { getApplicationAuthRequirement } from '../../../../../lib/application-auth';
import { maybeProxyToBff } from '../../../_lib/bff-route-proxy';
import { buildBffTrustedIdentityHeaders } from '../../../_lib/bff-trusted-session';

export const runtime = 'nodejs';

const applicationStepSchema = z.enum(applicationStepKeys);
const saveStepSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      step: string;
    }>;
  },
): Promise<NextResponse> {
  try {
    const { step } = await context.params;
    const parsedStep = applicationStepSchema.parse(step) as ApplicationStepKey;
    const session = await requireAuthenticatedWebSession(
      request,
      getApplicationAuthRequirement(parsedStep),
    );
    const proxiedResponse = await maybeProxyToBff(
      request,
      `/bff/application/steps/${parsedStep}`,
      {
        extraHeaders: buildBffTrustedIdentityHeaders(session),
      },
    );

    if (proxiedResponse) {
      return proxiedResponse;
    }

    return NextResponse.json({
      stepState: await readApplicationStepState(session, parsedStep),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to load the application step.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest,
  context: {
    params: Promise<{
      step: string;
    }>;
  },
): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const { step } = await context.params;
    const parsedStep = applicationStepSchema.parse(step) as ApplicationStepKey;
    const session = await requireAuthenticatedWebSession(
      request,
      getApplicationAuthRequirement(parsedStep),
    );
    const proxiedResponse = await maybeProxyToBff(
      request,
      `/bff/application/steps/${parsedStep}`,
      {
        extraHeaders: buildBffTrustedIdentityHeaders(session),
      },
    );

    if (proxiedResponse) {
      return proxiedResponse;
    }

    const payload = saveStepSchema.parse(await request.json());
    const saveResponse = await saveApplicationStep(
      session,
      parsedStep,
      payload,
    );

    return NextResponse.json(saveResponse);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to update the application step.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
