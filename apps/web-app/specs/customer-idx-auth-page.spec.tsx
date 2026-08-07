import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IdxStatus } from '@okta/okta-auth-js';
import { CustomerIdxAuthPage } from '../src/components/web/customer-idx-auth-page';

const startIdx = jest.fn();
const proceed = jest.fn();
const startTransaction = jest.fn();

jest.mock('@acme-los/api/web-client', () => ({
  createWebApiClient: () => ({
    auth: {
      completeIdx: jest.fn(),
      startIdx,
    },
  }),
}));

jest.mock('@acme-los/auth/web', () => ({
  createIdxAuthClient: () => ({
    idx: {
      proceed,
      startTransaction,
    },
  }),
  getStoredLeadId: () => null,
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

describe('CustomerIdxAuthPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startIdx.mockResolvedValue({
      issuer: 'https://example.okta.com/oauth2/default',
      clientId: 'client-id',
      redirectUri: 'http://localhost:3000/account/sign-in',
      scopes: ['openid'],
      state: 'state',
      nonce: 'nonce',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      transactionId: 'transaction-id',
      maxAge: 1800,
      returnTo: '/apply/personal-info',
    });
    startTransaction.mockResolvedValue({
      status: IdxStatus.PENDING,
      nextStep: {
        name: 'challenge-authenticator',
        authenticator: { key: 'okta_email' },
        inputs: [],
      },
    });
    proceed.mockResolvedValue({
      status: IdxStatus.PENDING,
      nextStep: {
        name: 'challenge-authenticator',
        authenticator: { key: 'okta_email' },
        inputs: [
          {
            name: 'verificationCode',
            label: 'Verification code',
            required: true,
          },
        ],
      },
    });
  });

  it('allows a zero-input email remediation to send one code explicitly', async () => {
    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
      />,
    );

    const sendButton = await screen.findByRole('button', {
      name: /send email code/i,
    });

    expect((sendButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(proceed).toHaveBeenCalledTimes(1);
      expect(proceed).toHaveBeenCalledWith({
        step: 'challenge-authenticator',
      });
    });

    expect(await screen.findByLabelText(/verification code/i)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: /verify code/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('shows password before the opposite factor for an email change', async () => {
    startIdx.mockResolvedValue({
      issuer: 'https://example.okta.com/oauth2/default',
      clientId: 'client-id',
      redirectUri: 'http://localhost:3000/account/sign-in',
      scopes: ['openid'],
      state: 'state',
      nonce: 'nonce',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      transactionId: 'transaction-id',
      maxAge: 1800,
      returnTo: '/account/security/email',
      stepUpReason: 'account-email',
    });
    const authenticatorSelection = {
      status: IdxStatus.PENDING,
      nextStep: {
        name: 'select-authenticator-authenticate',
        inputs: [
          {
            name: 'authenticator',
            options: [
              {
                label: 'Password',
                value: 'okta_password',
                relatesTo: { key: 'okta_password' },
              },
              {
                label: 'Email',
                value: 'okta_email',
                relatesTo: { key: 'okta_email' },
              },
              {
                label: 'Phone',
                value: 'phone_number',
                relatesTo: { key: 'phone_number' },
              },
            ],
          },
        ],
      },
    };
    startTransaction.mockResolvedValue(authenticatorSelection);
    proceed
      .mockResolvedValueOnce({
        status: IdxStatus.PENDING,
        nextStep: {
          name: 'challenge-authenticator',
          authenticator: { key: 'okta_password' },
          inputs: [{ name: 'password', required: true, secret: true }],
        },
      })
      .mockResolvedValueOnce(authenticatorSelection);

    render(
      <CustomerIdxAuthPage
        returnTo="/account/security/email"
        minimumAssuranceLevel="aal2"
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /use password/i }),
    );
    expect(screen.queryByRole('button', { name: /text a code/i })).toBeNull();

    const password = await screen.findByLabelText(/^password$/i);
    fireEvent.change(password, { target: { value: 'current-password' } });
    fireEvent.click(screen.getByRole('button', { name: /verify password/i }));

    expect(
      await screen.findByRole('button', { name: /text a code/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /use password/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /email a code/i })).toBeNull();
  });

  it('uses the single IDX start endpoint without ordinary account-access links after a sensitive change', async () => {
    render(
      <CustomerIdxAuthPage
        returnTo="/account/profile"
        minimumAssuranceLevel="aal2"
        postChange
      />,
    );

    await waitFor(() => {
      expect(startIdx).toHaveBeenCalledWith({
        returnTo: '/account/profile',
        minimumAssuranceLevel: 'aal2',
        leadId: undefined,
      });
    });

    expect(screen.queryByRole('link', { name: /^sign in$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /forgot password/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /create account/i })).toBeNull();
  });
});
