/** @jest-environment node */

import { SmsClient } from '@azure/communication-sms';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/hooks/okta/telephony/route';

jest.mock('@azure/communication-sms', () => ({
  SmsClient: jest.fn(),
}));

const smsClientMock = SmsClient as jest.MockedClass<typeof SmsClient>;
let requestAddressSuffix = 0;

function createTelephonyHookRequest({
  authorization = 'Basic dGVzdDp0ZXN0',
  deliveryChannel = 'SMS',
}: {
  authorization?: string;
  deliveryChannel?: string;
} = {}): NextRequest {
  const now = Date.now();

  return new NextRequest('https://los.example.test/api/hooks/okta/telephony', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
      'user-agent': 'okta-inline-hook',
      'x-forwarded-for': `203.0.113.${++requestAddressSuffix}`,
    },
    body: JSON.stringify({
      eventId: `evt-${requestAddressSuffix}`,
      eventTime: new Date(now).toISOString(),
      eventType: 'com.okta.telephony.provider',
      data: {
        messageProfile: {
          deliveryChannel,
          otpCode: 123456,
          otpExpires: new Date(now + 5 * 60 * 1000).toISOString(),
          phoneNumber: '+15555550123',
        },
      },
    }),
  });
}

describe('Okta telephony hook route', () => {
  const originalEnvironment = { ...process.env };
  const send = jest.fn();

  beforeEach(() => {
    process.env.ACME_ACS_ENDPOINT =
      'https://acs-acme-los-dev-cus-01.communication.azure.com';
    process.env.ACME_ACS_SMS_SENDER_PHONE_NUMBER = '+15555550100';
    process.env.ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION = 'Basic dGVzdDp0ZXN0';
    process.env.AZURE_CLIENT_ID = '00000000-0000-0000-0000-000000000001';

    send.mockResolvedValue([
      {
        messageId: 'sms-transaction-123',
        successful: true,
      },
    ]);
    smsClientMock.mockImplementation(() => ({ send }) as unknown as SmsClient);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.clearAllMocks();
  });

  it('sends a bounded SMS request to ACS and returns the Okta success contract', async () => {
    const response = await POST(createTelephonyHookRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledWith(
      {
        from: '+15555550100',
        to: ['+15555550123'],
        message:
          'Your ACME verification code is 123456. Msg&data rates may apply. Reply HELP for help or STOP to opt out.',
      },
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(payload).toEqual({
      commands: [
        {
          type: 'com.okta.telephony.action',
          value: [
            {
              provider: 'AZURE_COMMUNICATION_SERVICES',
              status: 'SUCCESSFUL',
              transactionId: 'sms-transaction-123',
            },
          ],
        },
      ],
    });
  });

  it('returns success without sending SMS when dev mock provider is enabled', async () => {
    process.env.ACME_OKTA_TELEPHONY_PROVIDER = 'mock';
    process.env.ACME_ENABLE_MOCK_SMS_OTP = 'true';
    process.env.APP_ENVIRONMENT_NAME = 'dev';

    const response = await POST(createTelephonyHookRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(payload).toEqual({
      commands: [
        {
          type: 'com.okta.telephony.action',
          value: [
            {
              provider: 'ACME_MOCK_SMS',
              status: 'SUCCESSFUL',
              transactionId: expect.stringMatching(/^mock-evt-\d+$/),
            },
          ],
        },
      ],
    });
  });

  it('refuses mock provider outside local or dev environments', async () => {
    process.env.ACME_OKTA_TELEPHONY_PROVIDER = 'mock';
    process.env.ACME_ENABLE_MOCK_SMS_OTP = 'true';
    process.env.APP_ENVIRONMENT_NAME = 'prod';

    const response = await POST(createTelephonyHookRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(payload).toEqual({
      error: {
        errorSummary: 'Unable to deliver the verification code.',
      },
    });
  });

  it('rejects requests without the configured authorization header', async () => {
    const response = await POST(
      createTelephonyHookRequest({ authorization: 'Basic invalid' }),
    );

    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns the Okta error contract without sending unsupported voice requests', async () => {
    const response = await POST(
      createTelephonyHookRequest({ deliveryChannel: 'VOICE' }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(payload).toEqual({
      error: {
        errorSummary: 'Unable to deliver the verification code.',
      },
    });
  });
});
