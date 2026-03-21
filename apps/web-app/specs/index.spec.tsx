import React from 'react';
import { render } from '@testing-library/react';
import Page from '../src/app/page';
import { AppProviders } from '../src/components/web/providers/app-providers';

process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'mock';

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
      React.createElement(AppProviders, null, React.createElement(Page)),
    );
    expect(baseElement).toBeTruthy();
  });
});
