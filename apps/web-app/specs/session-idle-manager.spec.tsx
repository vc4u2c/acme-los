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
  warningSeconds: number;
  touchSession?: () => Promise<boolean>;
}) {
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
      absoluteExpiresAt: overrides.idleExpiresAt + 3600,
      idleExpiresAt: overrides.idleExpiresAt,
      idleTimeoutSeconds: 120,
      warningSeconds: overrides.warningSeconds,
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    touchSession: overrides.touchSession ?? jest.fn().mockResolvedValue(true),
  });
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
});
