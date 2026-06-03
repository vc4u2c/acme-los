import { timingSafeEqual } from 'node:crypto';
import { SmsClient } from '@azure/communication-sms';
import { ManagedIdentityCredential } from '@azure/identity';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  checkRateLimit,
} from '@acme-los/api/web-server';
import { createConsoleLogger } from '@acme-los/core/logger';
import { z } from 'zod';

export const runtime = 'nodejs';

const logger = createConsoleLogger();
const telephonyHookRoute = '/api/hooks/okta/telephony';
const maximumRequestBytes = 16_384;
const maximumOtpLifetimeMilliseconds = 15 * 60 * 1000;

const telephonyHookRateLimitPolicy = {
  namespace: 'okta-telephony-hook',
  limit: 120,
  windowSeconds: 60,
} as const;

const e164PhoneNumber = z.coerce.string().regex(/^\+[1-9]\d{7,14}$/);
const isoDateTime = z.string().datetime({ offset: true });

const telephonyHookRequestSchema = z.object({
  eventId: z.string().trim().min(1).max(256),
  eventTime: isoDateTime,
  eventType: z.literal('com.okta.telephony.provider'),
  data: z.object({
    messageProfile: z.object({
      deliveryChannel: z.enum(['SMS', 'sms']),
      otpCode: z.coerce.string().regex(/^\d{4,10}$/),
      otpExpires: isoDateTime,
      phoneNumber: e164PhoneNumber,
    }),
  }),
});

type SmsMfaConfiguration = {
  authorization: string;
  endpoint: string;
  managedIdentityClientId: string;
  senderPhoneNumber: string;
};

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required runtime setting ${name}.`);
  }

  return value;
}

function readSmsMfaConfiguration(): SmsMfaConfiguration {
  const endpoint = readRequiredEnvironmentVariable('ACME_ACS_ENDPOINT');
  const senderPhoneNumber = readRequiredEnvironmentVariable(
    'ACME_ACS_SMS_SENDER_PHONE_NUMBER',
  );

  if (!endpoint.startsWith('https://')) {
    throw new Error('ACME_ACS_ENDPOINT must use HTTPS.');
  }

  if (!e164PhoneNumber.safeParse(senderPhoneNumber).success) {
    throw new Error(
      'ACME_ACS_SMS_SENDER_PHONE_NUMBER must be an E.164 phone number.',
    );
  }

  return {
    authorization: readRequiredEnvironmentVariable(
      'ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION',
    ),
    endpoint,
    managedIdentityClientId: readRequiredEnvironmentVariable('AZURE_CLIENT_ID'),
    senderPhoneNumber,
  };
}

function valuesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createTelephonyHookSuccessResponse(transactionId: string) {
  return {
    commands: [
      {
        type: 'com.okta.telephony.action',
        value: [
          {
            provider: 'AZURE_COMMUNICATION_SERVICES',
            status: 'SUCCESSFUL',
            transactionId,
          },
        ],
      },
    ],
  };
}

function createTelephonyHookErrorResponse() {
  return {
    error: {
      errorSummary: 'Unable to deliver the verification code.',
    },
  };
}

function isFreshOtpWindow(eventTime: string, otpExpires: string): boolean {
  const now = Date.now();
  const requestedAt = Date.parse(eventTime);
  const expiresAt = Date.parse(otpExpires);

  return (
    Number.isFinite(requestedAt) &&
    Number.isFinite(expiresAt) &&
    requestedAt <= now + 60_000 &&
    expiresAt > now &&
    expiresAt - now <= maximumOtpLifetimeMilliseconds
  );
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let eventId: string | undefined;

  try {
    const configuration = readSmsMfaConfiguration();
    const authorization = request.headers.get('authorization') ?? '';

    if (!valuesMatch(authorization, configuration.authorization)) {
      logger.warn('Rejected unauthorized Okta telephony hook request.', {
        event: 'okta.telephony_hook.unauthorized',
        route: telephonyHookRoute,
      });

      return NextResponse.json(
        { message: 'Unauthorized.' },
        {
          status: 401,
          headers: {
            'cache-control': 'no-store, max-age=0',
          },
        },
      );
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > maximumRequestBytes) {
      return NextResponse.json(createTelephonyHookErrorResponse(), {
        status: 413,
      });
    }

    const rateLimit = await checkRateLimit(
      request,
      telephonyHookRateLimitPolicy,
    );
    if (!rateLimit.allowed) {
      const response = NextResponse.json(createTelephonyHookErrorResponse(), {
        status: 429,
      });

      applyRateLimitHeaders(response, rateLimit);
      logger.warn('Okta telephony hook rate limit exceeded.', {
        event: 'okta.telephony_hook.rate_limited',
        route: telephonyHookRoute,
      });

      return response;
    }

    const requestText = await request.text();
    if (Buffer.byteLength(requestText, 'utf8') > maximumRequestBytes) {
      return NextResponse.json(createTelephonyHookErrorResponse(), {
        status: 413,
      });
    }

    const payload = telephonyHookRequestSchema.parse(JSON.parse(requestText));
    eventId = payload.eventId;

    if (
      !isFreshOtpWindow(
        payload.eventTime,
        payload.data.messageProfile.otpExpires,
      )
    ) {
      throw new Error('Rejected stale or invalid Okta OTP lifetime.');
    }

    const client = new SmsClient(
      configuration.endpoint,
      new ManagedIdentityCredential(configuration.managedIdentityClientId),
    );
    const [result] = await client.send(
      {
        from: configuration.senderPhoneNumber,
        to: [payload.data.messageProfile.phoneNumber],
        message: `Your ACME verification code is ${payload.data.messageProfile.otpCode}. Msg&data rates may apply. Reply HELP for help or STOP to opt out.`,
      },
      {
        abortSignal: AbortSignal.timeout(2_200),
      },
    );

    if (!result?.successful || !result.messageId) {
      throw new Error('Azure Communication Services rejected the SMS send.');
    }

    logger.info('Delivered Okta SMS MFA verification code through ACS.', {
      event: 'okta.telephony_hook.sms_delivered',
      eventId,
      route: telephonyHookRoute,
      transactionId: result.messageId,
    });

    const response = NextResponse.json(
      createTelephonyHookSuccessResponse(result.messageId),
      {
        status: 200,
        headers: {
          'cache-control': 'no-store, max-age=0',
        },
      },
    );

    applyRateLimitHeaders(response, rateLimit);
    return response;
  } catch (error) {
    logger.error('Okta telephony hook SMS delivery failed.', {
      event: 'okta.telephony_hook.sms_failed',
      eventId,
      errorName: getErrorName(error),
      route: telephonyHookRoute,
    });

    return NextResponse.json(createTelephonyHookErrorResponse(), {
      status: 200,
      headers: {
        'cache-control': 'no-store, max-age=0',
      },
    });
  }
}
