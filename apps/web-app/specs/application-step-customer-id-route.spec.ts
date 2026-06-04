/** @jest-environment node */

import { NextRequest } from 'next/server';
import type { WebAuthSession } from '@acme-los/api/contracts';
import type * as WebServerModule from '@acme-los/api/web-server';
import type * as BffRouteProxyModule from '../src/app/api/_lib/bff-route-proxy';
import type * as ApplicationStepRouteModule from '../src/app/api/application/steps/[step]/route';

jest.mock('@acme-los/api/web-server', () => ({
  assertValidCsrf: jest.fn(),
  readApplicationStepState: jest.fn(),
  requireAuthenticatedWebSession: jest.fn(),
  saveApplicationStep: jest.fn(),
}));

jest.mock('../src/app/api/_lib/bff-route-proxy', () => ({
  maybeProxyToBff: jest.fn(),
}));

jest.mock('../src/app/api/_lib/bff-trusted-session', () => ({
  buildBffTrustedIdentityHeaders: jest.fn((session: WebAuthSession) => ({
    'x-acme-auth-provider': session.provider,
    'x-acme-authenticated-user-id': session.user?.id,
    'x-acme-authenticated-user-email': session.user?.email,
    'x-acme-authenticated-customer-id': session.user?.customerId,
    'x-acme-authenticated-lead-id': session.user?.leadId,
  })),
}));

const webServer = jest.requireMock('@acme-los/api/web-server') as jest.Mocked<
  typeof WebServerModule
>;
const bffRouteProxy = jest.requireMock(
  '../src/app/api/_lib/bff-route-proxy',
) as jest.Mocked<typeof BffRouteProxyModule>;
const { GET, PUT } =
  require('../src/app/api/application/steps/[step]/route') as typeof ApplicationStepRouteModule;

const authenticatedSession: WebAuthSession = {
  provider: 'okta',
  status: 'authenticated',
  isAuthenticated: true,
  assuranceLevel: 'aal1',
  user: {
    id: '00u-application-user-001',
    email: 'ada@example.test',
    displayName: 'Ada Customer',
  },
};

function createSaveStepRequest(): NextRequest {
  return new NextRequest(
    'https://los.example.test/api/application/steps/personal-info',
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: 'acme-los.csrf-token=csrf-123',
        'x-csrf-token': 'csrf-123',
      },
      body: JSON.stringify({
        payload: {
          firstName: 'Ada',
          lastName: 'Customer',
          email: 'ada@example.test',
          phone: '312-555-0100',
        },
      }),
    },
  );
}

function createLoadStepRequest(): NextRequest {
  return new NextRequest(
    'https://los.example.test/api/application/steps/personal-info',
    {
      method: 'GET',
    },
  );
}

describe('application step route', () => {
  const mockMaybeProxyToBff = bffRouteProxy.maybeProxyToBff;
  const mockReadApplicationStepState = webServer.readApplicationStepState;
  const mockRequireAuthenticatedWebSession =
    webServer.requireAuthenticatedWebSession;
  const mockSaveApplicationStep = webServer.saveApplicationStep;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads the personal-info step without mutating customer identity in the facade', async () => {
    mockRequireAuthenticatedWebSession.mockResolvedValue(authenticatedSession);
    mockMaybeProxyToBff.mockResolvedValue(null);
    mockReadApplicationStepState.mockResolvedValue({
      step: 'personal-info',
      payload: {},
      summary: {
        applicationId: 'application-123',
        currentStep: 'personal-info',
        completedSteps: [],
        lastUpdatedAt: '2026-06-03T00:00:00.000Z',
      },
    });

    const response = await GET(createLoadStepRequest(), {
      params: Promise.resolve({ step: 'personal-info' }),
    });

    expect(response.status).toBe(200);
    expect(mockReadApplicationStepState).toHaveBeenCalledWith(
      authenticatedSession,
      'personal-info',
    );
  });

  it('saves the personal-info step with trusted identity headers for the BFF-owned write-back', async () => {
    mockRequireAuthenticatedWebSession.mockResolvedValue(authenticatedSession);
    mockMaybeProxyToBff.mockResolvedValue(null);
    mockSaveApplicationStep.mockResolvedValue({
      stepState: {
        step: 'personal-info',
        payload: {},
        summary: {
          applicationId: 'application-123',
          currentStep: 'personal-info',
          completedSteps: ['personal-info'],
          lastUpdatedAt: '2026-06-03T00:00:00.000Z',
        },
      },
    });

    const response = await PUT(createSaveStepRequest(), {
      params: Promise.resolve({ step: 'personal-info' }),
    });

    expect(response.status).toBe(200);
    expect(mockMaybeProxyToBff).toHaveBeenCalledWith(
      expect.any(NextRequest),
      '/bff/application/steps/personal-info',
      expect.objectContaining({
        extraHeaders: expect.objectContaining({
          'x-acme-auth-provider': 'okta',
          'x-acme-authenticated-user-id': '00u-application-user-001',
          'x-acme-authenticated-user-email': 'ada@example.test',
        }),
      }),
    );
    expect(mockSaveApplicationStep).toHaveBeenCalledWith(
      authenticatedSession,
      'personal-info',
      expect.any(Object),
    );
  });
});
