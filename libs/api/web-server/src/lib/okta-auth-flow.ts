import { createHash } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_TRANSACTION_COOKIE_NAME,
  createRandomToken,
  readSignedCookie,
  setSignedCookie,
  clearCookie,
} from './cookies';
import { getSafeServerAuthReturnTo } from './auth-routing';
import { getServerWebAuthConfig } from './config';
import type { StoredWebAuthStepUpRequirement } from './session-store';
import {
  deleteStateValue,
  readStateValue,
  writeStateValue,
} from './state-store';

const AUTH_TRANSACTION_NAMESPACE = 'auth-transaction';
const AUTH_TRANSACTION_MAX_AGE_SECONDS = 10 * 60;

export type StoredWebAuthTransaction = {
  transactionId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  minimumAssuranceLevel: 'aal1' | 'aal2';
  expectedUserId?: string;
  leadId?: string;
  stepUp?: StoredWebAuthStepUpRequirement;
  expiresAt: number;
};

type LegacyWebAuthTransactionCookiePayload = Omit<
  StoredWebAuthTransaction,
  'transactionId'
>;

export type WebAuthTransactionCookiePayload = {
  transactionId: string;
  returnTo: string;
  minimumAssuranceLevel: 'aal1' | 'aal2';
  expiresAt: number;
};

export type StartedWebAuthTransaction = {
  transactionId: string;
  storedTransaction: StoredWebAuthTransaction;
  cookiePayload: WebAuthTransactionCookiePayload;
  authorizeUrl: string;
  maxAge: number;
};

export type StartedBffWebAuthTransaction = {
  transactionId: string;
  returnTo: string;
  minimumAssuranceLevel: 'aal1' | 'aal2';
  maxAge: number;
};

export type OktaTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function toBase64Url(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildIssuerEndpoint(issuer: string, endpoint: 'authorize' | 'token') {
  const issuerUrl = new URL(issuer);
  const issuerPath = issuerUrl.pathname.replace(/\/+$/, '');

  return new URL(
    `${issuerPath.replace(/^\//, '')}/v1/${endpoint}`,
    `${issuerUrl.origin}/`,
  );
}

function buildCodeChallenge(codeVerifier: string): string {
  return toBase64Url(createHash('sha256').update(codeVerifier).digest());
}

export function startOktaAuthTransaction({
  returnTo,
  minimumAssuranceLevel = 'aal1',
  expectedUserId,
  leadId,
  stepUp,
}: {
  returnTo?: string;
  minimumAssuranceLevel?: 'aal1' | 'aal2';
  expectedUserId?: string;
  leadId?: string;
  stepUp?: StoredWebAuthStepUpRequirement;
}): StartedWebAuthTransaction {
  const config = getServerWebAuthConfig();
  if (config.provider !== 'okta' || !config.okta) {
    throw new Error('Okta auth config is not available for sign-in.');
  }

  const state = createRandomToken();
  const nonce = createRandomToken();
  const codeVerifier = createRandomToken();
  const codeChallenge = buildCodeChallenge(codeVerifier);
  const safeReturnTo = getSafeServerAuthReturnTo(returnTo);
  const expiresAt =
    Math.floor(Date.now() / 1000) + AUTH_TRANSACTION_MAX_AGE_SECONDS;
  const authorizeUrl = buildIssuerEndpoint(config.okta.issuer, 'authorize');

  authorizeUrl.searchParams.set('client_id', config.okta.clientId);
  authorizeUrl.searchParams.set('redirect_uri', config.okta.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('response_mode', 'query');
  authorizeUrl.searchParams.set('scope', config.okta.scopes.join(' '));
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  if (minimumAssuranceLevel === 'aal2') {
    authorizeUrl.searchParams.set(
      'acr_values',
      config.okta.fundingStepUpAcrValues,
    );
  }

  const transactionId = createRandomToken();
  const storedTransaction: StoredWebAuthTransaction = {
    transactionId,
    state,
    nonce,
    codeVerifier,
    returnTo: safeReturnTo,
    minimumAssuranceLevel,
    expectedUserId:
      minimumAssuranceLevel === 'aal2' && expectedUserId?.trim()
        ? expectedUserId.trim()
        : undefined,
    leadId: leadId?.trim() ? leadId.trim() : undefined,
    stepUp: minimumAssuranceLevel === 'aal2' ? stepUp : undefined,
    expiresAt,
  };

  return {
    transactionId,
    storedTransaction,
    cookiePayload: {
      transactionId,
      returnTo: safeReturnTo,
      minimumAssuranceLevel,
      expiresAt,
    },
    authorizeUrl: authorizeUrl.toString(),
    maxAge: AUTH_TRANSACTION_MAX_AGE_SECONDS,
  };
}

export function readWebAuthTransactionCookie(
  request: NextRequest,
): WebAuthTransactionCookiePayload | null {
  const cookiePayload = readSignedCookie<
    WebAuthTransactionCookiePayload | LegacyWebAuthTransactionCookiePayload
  >(request, AUTH_TRANSACTION_COOKIE_NAME);

  if (!cookiePayload) {
    return null;
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  if (cookiePayload.expiresAt <= currentEpochSeconds) {
    return null;
  }

  if ('transactionId' in cookiePayload) {
    return cookiePayload;
  }

  return {
    transactionId: '',
    returnTo: cookiePayload.returnTo,
    minimumAssuranceLevel: cookiePayload.minimumAssuranceLevel,
    expiresAt: cookiePayload.expiresAt,
  };
}

export async function readWebAuthTransaction(
  request: NextRequest,
): Promise<StoredWebAuthTransaction | null> {
  const cookiePayload = readSignedCookie<
    WebAuthTransactionCookiePayload | LegacyWebAuthTransactionCookiePayload
  >(request, AUTH_TRANSACTION_COOKIE_NAME);

  if (!cookiePayload) {
    return null;
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  if (cookiePayload.expiresAt <= currentEpochSeconds) {
    return null;
  }

  if (!('transactionId' in cookiePayload)) {
    return {
      transactionId: '',
      ...cookiePayload,
    };
  }

  if (!cookiePayload.transactionId) {
    return null;
  }

  const storedTransaction = await readStateValue<StoredWebAuthTransaction>(
    AUTH_TRANSACTION_NAMESPACE,
    cookiePayload.transactionId,
  );

  if (
    !storedTransaction ||
    storedTransaction.expiresAt <= currentEpochSeconds
  ) {
    return null;
  }

  if (
    storedTransaction.returnTo !== cookiePayload.returnTo ||
    storedTransaction.minimumAssuranceLevel !==
      cookiePayload.minimumAssuranceLevel
  ) {
    return null;
  }

  return storedTransaction;
}

export async function writeWebAuthTransaction(
  request: NextRequest,
  response: NextResponse,
  transaction: StartedWebAuthTransaction,
): Promise<void> {
  await writeStateValue(
    AUTH_TRANSACTION_NAMESPACE,
    transaction.transactionId,
    transaction.storedTransaction,
    transaction.maxAge,
  );
  setSignedCookie(
    response,
    request,
    AUTH_TRANSACTION_COOKIE_NAME,
    transaction.cookiePayload,
    {
      maxAge: transaction.maxAge,
    },
  );
}

export async function deleteStoredWebAuthTransaction(
  transaction: StoredWebAuthTransaction | null,
): Promise<void> {
  if (!transaction?.transactionId) {
    return;
  }

  await deleteStateValue(AUTH_TRANSACTION_NAMESPACE, transaction.transactionId);
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

export async function exchangeOktaAuthorizationCode({
  code,
  codeVerifier,
}: {
  code: string;
  codeVerifier: string;
}): Promise<OktaTokenResponse> {
  const config = getServerWebAuthConfig();
  if (config.provider !== 'okta' || !config.okta) {
    throw new Error('Okta auth config is not available for callback exchange.');
  }

  const tokenUrl = buildIssuerEndpoint(config.okta.issuer, 'token');
  const requestBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.okta.clientId,
    redirect_uri: config.okta.redirectUri,
    code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: requestBody,
    cache: 'no-store',
  });
  const body = (await response.json()) as OktaTokenResponse;

  if (!response.ok) {
    const message =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
          ? body.error
          : `Okta token exchange failed (${response.status}).`;

    throw new Error(message);
  }

  if (typeof body.id_token !== 'string' || body.id_token.length === 0) {
    throw new Error('Okta did not return an id token for this callback.');
  }

  return body;
}

export async function refreshOktaTokenSet({
  refreshToken,
}: {
  refreshToken: string;
}): Promise<OktaTokenResponse> {
  const config = getServerWebAuthConfig();
  if (config.provider !== 'okta' || !config.okta) {
    throw new Error('Okta auth config is not available for token refresh.');
  }

  const tokenUrl = buildIssuerEndpoint(config.okta.issuer, 'token');
  const requestBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.okta.clientId,
    refresh_token: refreshToken,
    scope: config.okta.scopes.join(' '),
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: requestBody,
    cache: 'no-store',
  });
  const body = (await response.json()) as OktaTokenResponse;

  if (!response.ok) {
    const message =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
          ? body.error
          : `Okta token refresh failed (${response.status}).`;

    throw new Error(message);
  }

  if (typeof body.id_token !== 'string' || body.id_token.length === 0) {
    throw new Error('Okta did not return an id token for this refresh.');
  }

  return body;
}
