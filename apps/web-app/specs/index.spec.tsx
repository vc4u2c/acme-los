import React from 'react';
import { render } from '@testing-library/react';
import Page from '../src/app/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
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
    const { baseElement } = render(React.createElement(Page));
    expect(baseElement).toBeTruthy();
  });
});
