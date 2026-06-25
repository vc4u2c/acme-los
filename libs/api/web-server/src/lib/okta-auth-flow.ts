import type { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_TRANSACTION_COOKIE_NAME,
  readSignedCookie,
  setSignedCookie,
  clearCookie,
} from './cookies';
import { getSafeServerAuthReturnTo } from './auth-routing';

export type WebAuthTransactionCookiePayload = {
  transactionId: string;
  returnTo: string;
  minimumAssuranceLevel: 'aal1' | 'aal2';
  expiresAt: number;
};

export type StartedBffWebAuthTransaction = {
  transactionId: string;
  returnTo: string;
  minimumAssuranceLevel: 'aal1' | 'aal2';
  maxAge: number;
};

export function readWebAuthTransactionCookie(
  request: NextRequest,
): WebAuthTransactionCookiePayload | null {
  const cookiePayload = readSignedCookie<WebAuthTransactionCookiePayload>(
    request,
    AUTH_TRANSACTION_COOKIE_NAME,
  );

  if (!cookiePayload) {
    return null;
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  if (cookiePayload.expiresAt <= currentEpochSeconds) {
    return null;
  }

  if (!cookiePayload.transactionId) {
    return null;
  }

  return cookiePayload;
}

export function writeBffWebAuthTransaction(
  request: NextRequest,
  response: NextResponse,
  transaction: StartedBffWebAuthTransaction,
): void {
  setSignedCookie(
    response,
    request,
    AUTH_TRANSACTION_COOKIE_NAME,
    {
      transactionId: transaction.transactionId,
      returnTo: getSafeServerAuthReturnTo(transaction.returnTo),
      minimumAssuranceLevel: transaction.minimumAssuranceLevel,
      expiresAt: Math.floor(Date.now() / 1000) + transaction.maxAge,
    },
    {
      maxAge: transaction.maxAge,
    },
  );
}

export function clearWebAuthTransaction(
  request: NextRequest,
  response: NextResponse,
): void {
  clearCookie(response, request, AUTH_TRANSACTION_COOKIE_NAME);
}
