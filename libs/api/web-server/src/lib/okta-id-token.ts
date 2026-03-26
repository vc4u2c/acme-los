import { webcrypto } from 'node:crypto';
import { getServerWebAuthConfig } from './config';

type JwtClaims = Record<string, unknown>;
type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type OktaJwk = JsonWebKey & {
  kid?: string;
  use?: string;
};

type JwksCacheEntry = {
  expiresAt: number;
  keys: OktaJwk[];
};

const textEncoder = new TextEncoder();
const jwksCache = new Map<string, JwksCacheEntry>();
const knownOktaHostPattern = /(^|\.)okta(?:preview|-emea|-gov)?\.com$/i;

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    normalized.length % 4 === 0
      ? normalized
      : `${normalized}${'='.repeat(4 - (normalized.length % 4))}`;

  return Buffer.from(padded, 'base64');
}

function parseJwtPart<T>(value: string): T {
  return JSON.parse(fromBase64Url(value).toString('utf8')) as T;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }

  return [];
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, '');
}

function isAllowedOktaIssuer(
  configuredIssuer: string,
  claimedIssuer: string,
): boolean {
  const configuredUrl = new URL(configuredIssuer);
  const claimedUrl = new URL(claimedIssuer);
  const configuredPath = normalizeIssuer(configuredUrl.pathname);
  const claimedPath = normalizeIssuer(claimedUrl.pathname);

  if (claimedUrl.protocol !== 'https:' || configuredPath !== claimedPath) {
    return false;
  }

  if (claimedUrl.hostname === configuredUrl.hostname) {
    return true;
  }

  return knownOktaHostPattern.test(claimedUrl.hostname);
}

async function getJwks(issuer: string): Promise<OktaJwk[]> {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const issuerUrl = new URL(issuer);
  const jwksUrl = new URL(
    `${normalizeIssuer(issuerUrl.pathname).replace(/^\//, '')}/v1/keys`,
    `${issuerUrl.origin}/`,
  );

  const response = await fetch(jwksUrl, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Unable to load Okta JWKS (${response.status}).`);
  }

  const body = (await response.json()) as { keys?: OktaJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];

  jwksCache.set(issuer, {
    expiresAt: Date.now() + 5 * 60_000,
    keys,
  });

  return keys;
}

export async function verifyOktaIdToken(idToken: string): Promise<JwtClaims> {
  const config = getServerWebAuthConfig();
  if (config.provider !== 'okta' || !config.okta) {
    throw new Error('Okta auth config is not available for session syncing.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Expected a valid JWT id token.');
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJwtPart<JwtHeader>(headerPart);
  const claims = parseJwtPart<JwtClaims>(payloadPart);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Expected an RS256 Okta id token.');
  }

  const issuer = typeof claims.iss === 'string' ? claims.iss : '';
  if (!issuer) {
    throw new Error('The Okta id token is missing an issuer.');
  }

  if (!isAllowedOktaIssuer(config.okta.issuer, issuer)) {
    throw new Error('The Okta id token issuer does not match this app.');
  }

  const jwks = await getJwks(issuer);
  const signingKey = jwks.find((key) => key.kid === header.kid);

  if (!signingKey) {
    throw new Error('Unable to find the Okta signing key for this id token.');
  }

  const cryptoKey = await webcrypto.subtle.importKey(
    'jwk',
    signingKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify'],
  );

  const isValidSignature = await webcrypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    fromBase64Url(signaturePart),
    textEncoder.encode(`${headerPart}.${payloadPart}`),
  );

  if (!isValidSignature) {
    throw new Error('The Okta id token signature is invalid.');
  }

  if (!isAllowedOktaIssuer(config.okta.issuer, issuer)) {
    throw new Error('The Okta id token issuer does not match this app.');
  }

  const audiences = asStringArray(claims.aud);
  if (!audiences.includes(config.okta.clientId)) {
    throw new Error('The Okta id token audience does not match this app.');
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  const expiresAt =
    typeof claims.exp === 'number' ? Math.trunc(claims.exp) : undefined;

  if (!expiresAt || expiresAt <= currentEpochSeconds) {
    throw new Error('The Okta id token has expired.');
  }

  return claims;
}
