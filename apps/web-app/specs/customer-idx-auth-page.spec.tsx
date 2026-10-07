import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IdxStatus } from '@okta/okta-auth-js';
import { CustomerIdxAuthPage } from '../src/components/web/customer-idx-auth-page';
import {
  idxChallenge,
  idxFixtureConfig,
  idxForm,
  idxRegistration,
  stubIdxTransport,
} from './support/idx-sdk-fixture';

const startIdx = jest.fn();
const proceed = jest.fn();
const start = jest.fn();
const authClientFactory = jest.fn();
const { createIdxAuthClient } =
  jest.requireActual<typeof import('@acme-los/auth/web')>('@acme-los/auth/web');

jest.mock('@acme-los/api/web-client', () => ({
  createWebApiClient: () => ({
    auth: {
      completeIdx: jest.fn(),
      startIdx,
    },
  }),
}));

jest.mock('@acme-los/auth/web', () => ({
  createIdxAuthClient: (...args: unknown[]) => authClientFactory(...args),
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
    authClientFactory.mockReturnValue({ idx: { proceed, start } });
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
    start.mockResolvedValue({
      status: IdxStatus.PENDING,
      availableSteps: [
        {
          name: 'challenge-authenticator',
          authenticator: { key: 'okta_email' },
          inputs: [],
        },
      ],
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

  it.each(['okta_email', 'okta_password'])(
    'renders the actual SDK %s challenge after identify without resending',
    async (key) => {
      const client = createIdxAuthClient(idxFixtureConfig);
      const challenge = idxChallenge(key);
      const request = stubIdxTransport(client, [
        idxForm('identify', [{ name: 'identifier', required: true }]),
        challenge,
        challenge,
      ]);
      authClientFactory.mockReturnValue(client);
      startIdx.mockResolvedValue({
        ...idxFixtureConfig,
        returnTo: '/apply/personal-info',
      });
      render(
        <CustomerIdxAuthPage
          returnTo="/apply/personal-info"
          minimumAssuranceLevel="aal1"
          flow="authenticate"
        />,
      );
      fireEvent.change(await screen.findByLabelText(/^email$/i), {
        target: { value: 'fixture@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
      const label =
        key === 'okta_password' ? /^password$/i : /verification code/i;
      const input = await screen.findByLabelText(label);
      expect(input.getAttribute('type')).toBe(
        key === 'okta_password' ? 'password' : 'text',
      );
      expect(
        screen.queryByRole('button', { name: /send email code/i }),
      ).toBeNull();
      expect(
        request.mock.calls.filter(([, url]) =>
          url.endsWith('/challenge-authenticator'),
        ),
      ).toHaveLength(0);
      fireEvent.change(input, { target: { value: 'fixture-value' } });
      fireEvent.click(
        screen.getByRole('button', {
          name: key === 'okta_password' ? /verify password/i : /verify code/i,
        }),
      );
      await waitFor(() =>
        expect(
          request.mock.calls.filter(([, url]) =>
            url.endsWith('/challenge-authenticator'),
          ),
        ).toHaveLength(1),
      );
      expect(
        JSON.parse(request.mock.calls.at(-1)?.[2].data as string).credentials,
      ).toEqual({ passcode: 'fixture-value' });
    },
  );

  it('starts registration with real SDK structural steps that have no action callback', async () => {
    const client = createIdxAuthClient(idxFixtureConfig);
    const request = stubIdxTransport(client, [
      idxForm('select-enroll-profile', []),
      idxForm('enroll-profile', [
        {
          name: 'userProfile',
          type: 'object',
          form: {
            value: [
              { name: 'email', required: true },
              { name: 'firstName', required: true },
            ],
          },
        },
      ]),
    ]);
    authClientFactory.mockReturnValue(client);
    startIdx.mockResolvedValue({
      ...idxFixtureConfig,
      returnTo: '/apply/personal-info',
    });
    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
        flow="register"
      />,
    );
    expect(await screen.findByLabelText(/first name/i)).toBeTruthy();
    expect(
      request.mock.calls.filter(([, url]) =>
        url.endsWith('/select-enroll-profile'),
      ),
    ).toHaveLength(1);
  });

  it('submits registration display choices and a masked password through the real SDK', async () => {
    const client = createIdxAuthClient(idxFixtureConfig);
    const request = stubIdxTransport(client, [
      idxForm('select-enroll-profile', []),
      idxRegistration(),
      idxChallenge(),
    ]);
    authClientFactory.mockReturnValue(client);
    startIdx.mockResolvedValue({
      ...idxFixtureConfig,
      returnTo: '/apply/personal-info',
    });
    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
        flow="register"
      />,
    );
    const email = await screen.findByLabelText(/^email$/i);
    fireEvent.change(email, { target: { value: 'fixture@example.com' } });
    fireEvent.change(screen.getByLabelText(/^first name$/i), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText(/^last name$/i), {
      target: { value: 'Customer' },
    });
    const state = screen.getByRole('combobox', { name: /^state$/i });
    expect(state.getAttribute('name')).toBe('acmeState');
    expect(
      screen.getByRole('option', { name: 'Texas' }).getAttribute('value'),
    ).toBe('TX');
    expect(
      screen.getByRole('option', { name: 'Missouri' }).getAttribute('value'),
    ).toBe('MO');
    expect(screen.queryByRole('option', { name: 'display' })).toBeNull();
    fireEvent.change(state, { target: { value: 'TX' } });
    const password = screen.getByLabelText(/^password$/i);
    expect(password.getAttribute('type')).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    fireEvent.change(password, { target: { value: 'fixture-value' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByLabelText(/verification code/i)).toBeTruthy();
    const submission = JSON.parse(
      request.mock.calls.at(-1)?.[2].data as string,
    );
    expect(submission.userProfile).toEqual({
      email: 'fixture@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      acmeState: 'TX',
    });
    expect(submission.credentials).toEqual({ passcode: 'fixture-value' });
    expect(
      request.mock.calls.filter(([, url]) => url.endsWith('/enroll-profile')),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /send email code/i }),
    ).toBeNull();
  });

  it('renders the initial identify remediation returned by Auth JS 8 step mode', async () => {
    start.mockResolvedValue({
      status: IdxStatus.PENDING,
      availableSteps: [
        {
          name: 'identify',
          inputs: [{ name: 'identifier', required: true }],
        },
        { name: 'select-enroll-profile', inputs: [] },
        { name: 'unlock-account', inputs: [] },
      ],
    });

    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
        flow="authenticate"
      />,
    );

    expect(await screen.findByLabelText(/^email$/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start again/i })).toBeNull();
    expect(proceed).not.toHaveBeenCalled();
  });

  it('advances the structural registration step without sending a code', async () => {
    const selectEnrollmentProfile = jest.fn().mockResolvedValue({
      status: IdxStatus.PENDING,
      nextStep: {
        name: 'enroll-profile',
        inputs: [
          { name: 'firstName', required: true },
          { name: 'lastName', required: true },
          { name: 'email', required: true },
          { name: 'acmeState', required: true },
        ],
      },
    });
    start.mockResolvedValue({
      status: IdxStatus.PENDING,
      availableSteps: [
        {
          name: 'select-enroll-profile',
          inputs: [],
          action: selectEnrollmentProfile,
        },
        { name: 'identify', inputs: [{ name: 'identifier' }] },
      ],
    });

    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
        flow="register"
      />,
    );

    expect(await screen.findByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^state$/i)).toBeTruthy();
    expect(screen.queryByLabelText(/mobile phone/i)).toBeNull();
    expect(selectEnrollmentProfile).toHaveBeenCalledTimes(1);
    expect(proceed).not.toHaveBeenCalled();
  });

  it('allows a zero-input email remediation to send one code explicitly', async () => {
    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
        flow="authenticate"
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

  it('keeps both registration sign-in links usable after an existing-email error', async () => {
    const selectEnrollmentProfile = jest.fn().mockResolvedValue({
      status: IdxStatus.PENDING,
      nextStep: {
        name: 'enroll-profile',
        inputs: [{ name: 'email', required: true }],
      },
    });
    start.mockResolvedValue({
      status: IdxStatus.PENDING,
      availableSteps: [
        {
          name: 'select-enroll-profile',
          inputs: [],
          action: selectEnrollmentProfile,
        },
      ],
    });
    proceed.mockRejectedValue(
      new Error('A user with this email already exists'),
    );

    render(
      <CustomerIdxAuthPage
        returnTo="/apply/personal-info"
        minimumAssuranceLevel="aal1"
        flow="register"
      />,
    );

    fireEvent.change(await screen.findByLabelText(/^email$/i), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(/account with this email already exists/i),
    ).toBeTruthy();
    const signInLinks = screen.getAllByRole('link', { name: /^sign in$/i });
    expect(signInLinks).toHaveLength(2);
    for (const signInLink of signInLinks) {
      expect(signInLink.getAttribute('href')).toBe(
        '/account/sign-in?returnTo=%2Fapply%2Fpersonal-info',
      );
    }
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
    start.mockResolvedValue(authenticatorSelection);
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
        flow="authenticate"
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
        flow="authenticate"
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
