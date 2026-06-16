import { timingSafeEqual } from 'node:crypto';
import { SmsClient } from '@azure/communication-sms';
import { ManagedIdentityCredential } from '@azure/identity';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  readStateValue,
  writeStateValue,
} from '@acme-los/api/web-server';
import { createConsoleLogger } from '@acme-los/core/logger';
import { z } from 'zod';

export const runtime = 'nodejs';

const logger = createConsoleLogger();
const telephonyHookRoute = '/api/hooks/okta/telephony';
const maximumRequestBytes = 16_384;
const maximumOtpLifetimeMilliseconds = 15 * 60 * 1000;
const mockSmsOtpNamespace = 'okta-mock-sms-otp';
const mockSmsOtpLatestKey = 'latest';

const telephonyHookRateLimitPolicy = {
  namespace: 'okta-telephony-hook',
  limit: 120,
  windowSeconds: 60,
} as const;

const mockSmsOtpInboxRateLimitPolicy = {
  namespace: 'okta-mock-sms-inbox',
  limit: 600,
  windowSeconds: 60,
} as const;

const usPhoneNumber = z.coerce.string().regex(/^\+1\d{10}$/);
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
      phoneNumber: usPhoneNumber,
    }),
  }),
});

type SmsMfaConfiguration = {
  authorization: string;
  provider: 'acs' | 'mock';
  acs?: {
    endpoint: string;
    managedIdentityClientId: string;
    senderPhoneNumber: string;
  };
};

type TelephonyHookPayload = z.infer<typeof telephonyHookRequestSchema>;

type MockSmsOtpInboxRecord = {
  event: 'okta.telephony_hook.mock_sms_delivered';
  eventId: string;
  timestamp: string;
  maskedPhoneNumber: string;
  mockOtpCode: string;
  otpExpires: string;
  route: string;
  transactionId: string;
};

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required runtime setting ${name}.`);
  }

  return value;
}

function readBooleanEnvironmentVariable(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function readSmsMfaConfiguration(): SmsMfaConfiguration {
  const provider = (process.env.ACME_OKTA_TELEPHONY_PROVIDER ?? 'acs')
    .trim()
    .toLowerCase();
  const authorization = readRequiredEnvironmentVariable(
    'ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION',
  );

  if (provider === 'mock') {
    assertMockSmsAllowed();

    return {
      authorization,
      provider,
    };
  }

  if (provider !== 'acs') {
    throw new Error('ACME_OKTA_TELEPHONY_PROVIDER must be "acs" or "mock".');
  }

  const endpoint = readRequiredEnvironmentVariable('ACME_ACS_ENDPOINT');
  const senderPhoneNumber = readRequiredEnvironmentVariable(
    'ACME_ACS_SMS_SENDER_PHONE_NUMBER',
  );

  if (!endpoint.startsWith('https://')) {
    throw new Error('ACME_ACS_ENDPOINT must use HTTPS.');
  }

  if (!usPhoneNumber.safeParse(senderPhoneNumber).success) {
    throw new Error(
      'ACME_ACS_SMS_SENDER_PHONE_NUMBER must be a US E.164 phone number.',
    );
  }

  return {
    authorization,
    provider,
    acs: {
      endpoint,
      managedIdentityClientId:
        readRequiredEnvironmentVariable('AZURE_CLIENT_ID'),
      senderPhoneNumber,
    },
  };
}

function assertMockSmsAllowed(): void {
  const mockEnabled = readBooleanEnvironmentVariable(
    'ACME_ENABLE_MOCK_SMS_OTP',
  );
  const environmentName = (
    process.env.APP_ENVIRONMENT_NAME ??
    process.env.NEXT_PUBLIC_APP_ENVIRONMENT ??
    process.env.NODE_ENV ??
    ''
  )
    .trim()
    .toLowerCase();
  const isDevLikeEnvironment = ['development', 'local', 'dev', 'test'].includes(
    environmentName,
  );

  if (!mockEnabled || !isDevLikeEnvironment) {
    throw new Error(
      'Mock Okta SMS delivery requires ACME_ENABLE_MOCK_SMS_OTP=true and a local/dev runtime environment.',
    );
  }
}

function valuesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createTelephonyHookSuccessResponse(
  transactionId: string,
  provider = 'AZURE_COMMUNICATION_SERVICES',
) {
  return {
    commands: [
      {
        type: 'com.okta.telephony.action',
        value: [
          {
            provider,
            status: 'SUCCESSFUL',
            transactionId,
          },
        ],
      },
    ],
  };
}

function maskPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/^\+(\d{1,3})\d+(\d{4})$/, '+$1******$2');
}

function createMockTransactionId(eventId: string): string {
  return `mock-${eventId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)}`;
}

function createMockSmsOtpInboxRecord(
  payload: TelephonyHookPayload,
  transactionId: string,
): MockSmsOtpInboxRecord {
  return {
    event: 'okta.telephony_hook.mock_sms_delivered',
    eventId: payload.eventId,
    timestamp: new Date().toISOString(),
    maskedPhoneNumber: maskPhoneNumber(payload.data.messageProfile.phoneNumber),
    mockOtpCode: payload.data.messageProfile.otpCode,
    otpExpires: payload.data.messageProfile.otpExpires,
    route: telephonyHookRoute,
    transactionId,
  };
}

function getMockSmsOtpTtlSeconds(otpExpires: string): number {
  const expiresAt = Date.parse(otpExpires);
  const lifetimeMilliseconds = Number.isFinite(expiresAt)
    ? expiresAt - Date.now()
    : maximumOtpLifetimeMilliseconds;

  return Math.max(
    1,
    Math.min(
      Math.ceil(lifetimeMilliseconds / 1000),
      maximumOtpLifetimeMilliseconds / 1000,
    ),
  );
}

async function writeLatestMockSmsOtp(
  record: MockSmsOtpInboxRecord,
): Promise<void> {
  await writeStateValue(
    mockSmsOtpNamespace,
    mockSmsOtpLatestKey,
    record,
    getMockSmsOtpTtlSeconds(record.otpExpires),
  );
}

async function readLatestMockSmsOtp(): Promise<MockSmsOtpInboxRecord | null> {
  const record = await readStateValue<MockSmsOtpInboxRecord>(
    mockSmsOtpNamespace,
    mockSmsOtpLatestKey,
  );

  if (!record || Date.parse(record.otpExpires) <= Date.now()) {
    return null;
  }

  return record;
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const configuration = readSmsMfaConfiguration();
    const authorization = request.headers.get('authorization') ?? '';

    if (configuration.provider !== 'mock') {
      return NextResponse.json(
        { message: 'Mock SMS inbox is not enabled.' },
        {
          status: 404,
          headers: {
            'cache-control': 'no-store, max-age=0',
          },
        },
      );
    }

    if (!valuesMatch(authorization, configuration.authorization)) {
      logger.warn('Rejected unauthorized Okta mock SMS inbox request.', {
        event: 'okta.telephony_hook.mock_sms_inbox_unauthorized',
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

    const rateLimit = await checkRateLimit(
      request,
      mockSmsOtpInboxRateLimitPolicy,
    );
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { message: 'Too many mock SMS inbox requests.' },
        {
          status: 429,
          headers: {
            'cache-control': 'no-store, max-age=0',
          },
        },
      );

      applyRateLimitHeaders(response, rateLimit);
      return response;
    }

    const response = NextResponse.json(
      { record: await readLatestMockSmsOtp() },
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
    logger.warn('Mock Okta SMS inbox is unavailable.', {
      event: 'okta.telephony_hook.mock_sms_inbox_unavailable',
      errorName: getErrorName(error),
      route: telephonyHookRoute,
    });

    return NextResponse.json(
      { message: 'Mock SMS inbox is not available.' },
      {
        status: 404,
        headers: {
          'cache-control': 'no-store, max-age=0',
        },
      },
    );
  }
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

    if (configuration.provider === 'mock') {
      const transactionId = createMockTransactionId(payload.eventId);
      const mockSmsOtpRecord = createMockSmsOtpInboxRecord(
        payload,
        transactionId,
      );

      await writeLatestMockSmsOtp(mockSmsOtpRecord);

      logger.warn('Mock delivered Okta SMS MFA verification code.', {
        event: mockSmsOtpRecord.event,
        eventId: mockSmsOtpRecord.eventId,
        maskedPhoneNumber: mockSmsOtpRecord.maskedPhoneNumber,
        otpExpires: mockSmsOtpRecord.otpExpires,
        route: mockSmsOtpRecord.route,
        transactionId: mockSmsOtpRecord.transactionId,
      });

      const response = NextResponse.json(
        createTelephonyHookSuccessResponse(transactionId, 'ACME_MOCK_SMS'),
        {
          status: 200,
          headers: {
            'cache-control': 'no-store, max-age=0',
          },
        },
      );

      applyRateLimitHeaders(response, rateLimit);
      return response;
    }

    if (!configuration.acs) {
      throw new Error('ACS telephony configuration was not resolved.');
    }

    const client = new SmsClient(
      configuration.acs.endpoint,
      new ManagedIdentityCredential(configuration.acs.managedIdentityClientId),
    );
    const [result] = await client.send(
      {
        from: configuration.acs.senderPhoneNumber,
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
