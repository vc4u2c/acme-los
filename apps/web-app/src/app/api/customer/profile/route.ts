import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertValidCsrf,
  requireAuthenticatedWebSession,
  readCustomerProfile,
  writeCustomerProfile,
} from '@acme-los/api/web-server';

export const runtime = 'nodejs';

const customerProfileSchema = z.object({
  email: z.string().trim().email(),
  phone: z.string().trim(),
  streetAddress: z.string().trim(),
  addressLine2: z.string().trim(),
  city: z.string().trim(),
  state: z.string().trim(),
  zipCode: z.string().trim(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuthenticatedWebSession(request);

    return NextResponse.json({
      profile: readCustomerProfile(request, session),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Authentication is required.';

    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    assertValidCsrf(request);
    const session = requireAuthenticatedWebSession(request);
    const payload = z
      .object({
        profile: customerProfileSchema,
      })
      .parse(await request.json());
    const profile = {
      ...payload.profile,
      email: payload.profile.email || session.user?.email || '',
    };
    const response = NextResponse.json({ profile });

    writeCustomerProfile(request, response, profile);

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to update the customer profile.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
