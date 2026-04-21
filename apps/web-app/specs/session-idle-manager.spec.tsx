import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useAuthSession } from '@acme-los/auth/web';
import { SessionIdleManager } from '../src/components/web/providers/session-idle-manager';

jest.mock('@acme-los/auth/web', () => ({
  useAuthSession: jest.fn(),
}));

const mockUseAuthSession = useAuthSession as jest.MockedFunction<
  typeof useAuthSession
>;

function mockAuthenticatedSession(overrides: {
  idleExpiresAt: number;
  absoluteExpiresAt?: number;
  warningSeconds: number;
  signOut?: () => Promise<void>;
  touchSession?: () => Promise<boolean>;
}) {
  const signOut = overrides.signOut ?? jest.fn().mockResolvedValue(undefined);
  const touchSession =
    overrides.touchSession ?? jest.fn().mockResolvedValue(true);

  mockUseAuthSession.mockReturnValue({
    session: {
      provider: 'okta',
      status: 'authenticated',
      isAuthenticated: true,
      assuranceLevel: 'aal1',
      user: {
        id: 'customer-1',
        displayName: 'Ada Customer',
      },
    },
    sessionTiming: {
      absoluteExpiresAt:
        overrides.absoluteExpiresAt ?? overrides.idleExpiresAt + 3600,
      idleExpiresAt: overrides.idleExpiresAt,
      idleTimeoutSeconds: 120,
      warningSeconds: overrides.warningSeconds,
    },
    signIn: jest.fn(),
    signOut,
    refreshSession: jest.fn(),
    touchSession,
  });

  return { signOut, touchSession };
}

describe('SessionIdleManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('opens the warning modal when the idle warning window starts', () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);

    mockAuthenticatedSession({
      idleExpiresAt: currentEpochSeconds + 120,
      warningSeconds: 30,
    });

    render(<SessionIdleManager />);

    expect(screen.queryByText('Still with us?')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(screen.getByText('Still with us?')).toBeTruthy();
    expect(screen.getByText('0:30')).toBeTruthy();
  });

  it('touches the server session after meaningful user activity', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);
    const touchSession = jest.fn().mockResolvedValue(true);

    mockAuthenticatedSession({
      idleExpiresAt: currentEpochSeconds + 120,
      warningSeconds: 30,
      touchSession,
    });

    render(<SessionIdleManager />);

    act(() => {
      jest.advanceTimersByTime(31_000);
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Tab' });
      await Promise.resolve();
    });

    expect(touchSession).toHaveBeenCalledTimes(1);
  });

  it('signs out at the effective absolute expiry when it arrives before idle expiry', () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);
    const signOut = jest.fn().mockResolvedValue(undefined);

    mockAuthenticatedSession({
      absoluteExpiresAt: currentEpochSeconds + 10,
      idleExpiresAt: currentEpochSeconds + 120,
      warningSeconds: 30,
      signOut,
    });

    render(<SessionIdleManager />);

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(screen.getByText('Still with us?')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out when the warning modal cannot extend the server session', async () => {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);
    const signOut = jest.fn().mockResolvedValue(undefined);

    mockAuthenticatedSession({
      idleExpiresAt: currentEpochSeconds + 30,
      warningSeconds: 30,
      signOut,
      touchSession: jest.fn().mockResolvedValue(false),
    });

    render(<SessionIdleManager />);

    act(() => {
      jest.advanceTimersByTime(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Stay signed in'));
      await Promise.resolve();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
