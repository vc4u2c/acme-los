import React from 'react';
import { render } from '@testing-library/react';
import Page from '../src/app/page';
import { AppProviders } from '../src/components/web/providers/app-providers';
import type { AnalyticsRuntimeConfig } from '../src/lib/analytics/config';

process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'mock';

const analyticsConfig: AnalyticsRuntimeConfig = {
  enabled: false,
  environment: 'test',
  mode: 'disabled',
  gtmContainerId: '',
  ga4MeasurementId: '',
  consent: {
    analyticsStorage: 'denied',
    adStorage: 'denied',
    adUserData: 'denied',
    adPersonalization: 'denied',
  },
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return React.createElement('a', { href }, children);
  };
});

describe('Page', () => {
  it('should render successfully', () => {
    const { baseElement } = render(
      React.createElement(
        AppProviders,
        { analyticsConfig },
        React.createElement(Page),
      ),
    );
    expect(baseElement).toBeTruthy();
  });
});
