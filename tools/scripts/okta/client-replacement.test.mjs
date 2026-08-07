import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOAuthClientReplacementPayload } from './client-replacement.mjs';

function buildExistingClient() {
  return {
    client_id: '0oa-existing',
    client_id_issued_at: 1234567890,
    client_secret: 'do-not-forward',
    client_secret_expires_at: 0,
    client_name: 'ACME LOS Web (dev)',
    client_uri: null,
    application_type: 'browser',
    consent_method: 'TRUSTED',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: ['https://old.example/auth/callback'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

function buildDesiredApplication() {
  return {
    label: 'ACME LOS Web (dev)',
    credentials: {
      oauthClient: {
        token_endpoint_auth_method: 'none',
      },
    },
    settings: {
      oauthClient: {
        application_type: 'browser',
        grant_types: [
          'authorization_code',
          'interaction_code',
          'refresh_token',
        ],
        redirect_uris: ['https://new.example/auth/callback'],
        response_types: ['code'],
      },
    },
  };
}

test('builds a complete client replacement without forwarding secrets or timestamps', () => {
  const replacement = buildOAuthClientReplacementPayload(
    buildExistingClient(),
    buildDesiredApplication(),
  );

  assert.equal(replacement.client_id, '0oa-existing');
  assert.equal(replacement.client_name, 'ACME LOS Web (dev)');
  assert.equal('client_id_issued_at' in replacement, false);
  assert.equal('client_secret' in replacement, false);
  assert.equal('client_secret_expires_at' in replacement, false);
  assert.deepEqual(replacement.grant_types, [
    'authorization_code',
    'interaction_code',
    'refresh_token',
  ]);
  assert.deepEqual(replacement.redirect_uris, [
    'https://new.example/auth/callback',
  ]);
});

test('preserves existing client settings outside the declared changes', () => {
  const replacement = buildOAuthClientReplacementPayload(
    buildExistingClient(),
    buildDesiredApplication(),
  );

  assert.equal(replacement.client_uri, null);
  assert.equal(replacement.consent_method, 'TRUSTED');
});

test('rejects token endpoint authentication method drift', () => {
  const existing = buildExistingClient();
  const desired = buildDesiredApplication();
  desired.credentials.oauthClient.token_endpoint_auth_method =
    'client_secret_post';

  assert.throws(
    () => buildOAuthClientReplacementPayload(existing, desired),
    /credential migration \(none -> client_secret_post\)/,
  );
});

test('rejects an incomplete client resource', () => {
  const existing = buildExistingClient();
  delete existing.client_id;

  assert.throws(
    () =>
      buildOAuthClientReplacementPayload(existing, buildDesiredApplication()),
    /complete Okta OAuth client resource is required/,
  );
});

test('does not mutate the existing client or desired application', () => {
  const existing = buildExistingClient();
  const desired = buildDesiredApplication();
  const existingSnapshot = structuredClone(existing);
  const desiredSnapshot = structuredClone(desired);

  buildOAuthClientReplacementPayload(existing, desired);

  assert.deepEqual(existing, existingSnapshot);
  assert.deepEqual(desired, desiredSnapshot);
});
