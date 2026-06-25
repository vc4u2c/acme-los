import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import {
  applicationStepKeys,
  type ApplicationStepKey,
} from '@acme-los/api/contracts';
import {
  assertValidCsrf,
  requireAuthenticatedWebSession,
} from '@acme-los/api/web-server';
import { getApplicationAuthRequirement } from '../../../../../lib/application-auth';
import { proxyToBff } from '../../../_lib/bff-route-proxy';
import { buildBffTrustedIdentityHeaders } from '../../../_lib/bff-trusted-session';

export const runtime = 'nodejs';

const applicationStepSchema = z.enum(applicationStepKeys);

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

    return proxyToBff(request, `/bff/application/steps/${parsedStep}`, {
      extraHeaders: buildBffTrustedIdentityHeaders(session),
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

    return proxyToBff(request, `/bff/application/steps/${parsedStep}`, {
      extraHeaders: buildBffTrustedIdentityHeaders(session),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to update the application step.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
