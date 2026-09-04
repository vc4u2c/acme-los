import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountSecurityChangePage } from '../src/components/web/account-security-change-page';
import { AccountSecurityPasswordPage } from '../src/components/web/account-security-password-page';

const startEmailChange = jest.fn();
const verifyEmailChange = jest.fn();
const startPhoneChange = jest.fn();
const verifyPhoneChange = jest.fn();
const changePassword = jest.fn();

jest.mock('@acme-los/api/web-client', () => ({
  createWebApiClient: () => ({
    accountSecurity: {
      startEmailChange,
      verifyEmailChange,
      startPhoneChange,
      verifyPhoneChange,
      changePassword,
    },
  }),
}));

jest.mock('../src/components/web/site-header', () => ({
  SiteHeader: () => React.createElement('header'),
}));

describe('account security pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends one email challenge only after the customer requests it and preserves its ids for verification', async () => {
    startEmailChange.mockResolvedValue({
      emailId: 'email-123',
      challengeId: 'challenge-456',
      email: 'new.customer@example.com',
    });
    verifyEmailChange.mockResolvedValue({
      status: 'verified',
      email: 'new.customer@example.com',
    });

    render(<AccountSecurityChangePage action="email" />);

    expect(startEmailChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/new sign-in email/i), {
      target: { value: 'new.customer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send email code/i }));

    await waitFor(() => {
      expect(startEmailChange).toHaveBeenCalledTimes(1);
    });
    expect(startEmailChange).toHaveBeenCalledWith({
      email: 'new.customer@example.com',
    });

    fireEvent.change(await screen.findByLabelText(/email verification code/i), {
      target: { value: '123456' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /verify email change/i }),
    );

    await waitFor(() => {
      expect(verifyEmailChange).toHaveBeenCalledWith({
        emailId: 'email-123',
        challengeId: 'challenge-456',
        verificationCode: '123456',
      });
    });
    expect((await screen.findByRole('dialog')).textContent).toContain(
      'Email changed',
    );
    expect(
      screen
        .getByRole('link', { name: /securely sign in again/i })
        .getAttribute('href'),
    ).toBe('/api/auth/logout');
  });

  it('does not reveal an unusable email OTP form when Okta omits the challenge id', async () => {
    startEmailChange.mockResolvedValue({
      emailId: 'email-123',
      challengeId: '',
      email: 'new.customer@example.com',
    });

    render(<AccountSecurityChangePage action="email" />);

    fireEvent.change(screen.getByLabelText(/new sign-in email/i), {
      target: { value: 'new.customer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send email code/i }));

    expect(
      await screen.findByText(/valid email verification challenge/i),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/email verification code/i)).toBeNull();
    expect(verifyEmailChange).not.toHaveBeenCalled();
  });

  it('starts and verifies a phone change with the same Okta phone transaction', async () => {
    startPhoneChange.mockResolvedValue({
      phoneId: 'phone-123',
      phoneNumber: '+13145550123',
    });
    verifyPhoneChange.mockResolvedValue({ status: 'verified' });

    render(<AccountSecurityChangePage action="phone" />);

    expect(startPhoneChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/new sms phone/i), {
      target: { value: '+13145550123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send sms code/i }));

    await waitFor(() => {
      expect(startPhoneChange).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(await screen.findByLabelText(/sms verification code/i), {
      target: { value: '654321' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /verify phone change/i }),
    );

    await waitFor(() => {
      expect(verifyPhoneChange).toHaveBeenCalledWith({
        phoneId: 'phone-123',
        verificationCode: '654321',
      });
    });
    expect((await screen.findByRole('dialog')).textContent).toContain(
      'Phone changed',
    );
  });

  it('validates password confirmation locally and clears secrets after mutation', async () => {
    changePassword.mockResolvedValue({ status: 'changed' });
    render(<AccountSecurityPasswordPage />);

    const currentPassword = screen.getByLabelText(/current password/i);
    const newPassword = screen.getByLabelText(/^new password$/i);
    const confirmPassword = screen.getByLabelText(/confirm new password/i);

    fireEvent.change(currentPassword, { target: { value: 'current-123' } });
    fireEvent.change(newPassword, { target: { value: 'new-123' } });
    fireEvent.change(confirmPassword, { target: { value: 'different-123' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/confirmation must match/i)).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();

    fireEvent.change(newPassword, { target: { value: 'new-456' } });
    fireEvent.change(confirmPassword, { target: { value: 'new-456' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'current-123',
        newPassword: 'new-456',
      });
    });
    expect((await screen.findByRole('dialog')).textContent).toContain(
      'Password changed',
    );
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    expect(screen.queryByLabelText(/^new password$/i)).toBeNull();
    expect(screen.queryByLabelText(/confirm new password/i)).toBeNull();
  });
});
