import React from 'react';
import { waitFor, render } from '@testing-library/react';
import { useAuthSession } from '@acme-los/auth/web';
import { usePathname } from 'next/navigation';
import { AnalyticsRouteTracker } from '../src/components/web/analytics/analytics-route-tracker';
import type { AnalyticsRuntimeConfig } from '../src/lib/analytics/config';

jest.mock('@acme-los/auth/web', () => ({
  useAuthSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const mockUseAuthSession = useAuthSession as jest.MockedFunction<
  typeof useAuthSession
>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

const analyticsConfig: AnalyticsRuntimeConfig = {
  enabled: true,
  environment: 'dev',
  mode: 'gtm',
  gtmContainerId: 'GTM-TEST123',
  ga4MeasurementId: 'G-TEST123',
  consent: {
    analyticsStorage: 'denied',
    adStorage: 'denied',
    adUserData: 'denied',
    adPersonalization: 'denied',
  },
};

describe('AnalyticsRouteTracker', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
    mockUseAuthSession.mockReturnValue({
      session: {
        provider: 'okta',
        status: 'unauthenticated',
        isAuthenticated: false,
        assuranceLevel: 'anonymous',
        user: null,
      },
      sessionTiming: null,
      signIn: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
      touchSession: jest.fn(),
    });
    window.dataLayer = [];
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete window.dataLayer;
  });

  it('pushes a page_view using the server-provided analytics config', async () => {
    render(<AnalyticsRouteTracker config={analyticsConfig} />);

    await waitFor(() => {
      expect(window.dataLayer).toEqual([
        expect.objectContaining({
          event: 'page_view',
          environment: 'dev',
          page_location: 'http://localhost/',
          page_path: '/',
          route_group: 'home',
          auth_state: 'anonymous',
        }),
      ]);
    });
  });
});
