import type { OktaAuth } from '@okta/okta-auth-js';

export const idxFixtureConfig = {
  issuer: 'https://example.okta.com/oauth2/default',
  clientId: 'fixture-client',
  redirectUri: 'http://localhost:3000/account/sign-in',
  scopes: ['openid', 'email'],
  state: 'fixture-state',
  nonce: 'fixture-nonce',
  codeChallenge: 'server-generated-challenge-for-this-fixture',
  codeChallengeMethod: 'S256',
};

export function idxForm(
  name: string,
  inputs: object[],
  authenticatorKey?: string,
) {
  return {
    version: '1.0.0',
    stateHandle: 'fixture-state-handle',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    remediation: {
      type: 'array',
      value: [
        {
          rel: ['create-form'],
          name,
          href: `https://example.okta.com/idp/idx/${name}`,
          method: 'POST',
          accepts: 'application/json',
          ...(authenticatorKey
            ? { relatesTo: ['$.currentAuthenticator'] }
            : {}),
          value: [
            ...inputs,
            {
              name: 'stateHandle',
              value: 'fixture-state-handle',
              visible: false,
            },
          ],
        },
      ],
    },
    ...(authenticatorKey
      ? {
          currentAuthenticator: {
            type: 'object',
            value: {
              id: 'fixture-authenticator',
              key: authenticatorKey,
              type: authenticatorKey === 'okta_password' ? 'password' : 'email',
            },
          },
        }
      : {}),
  };
}

export function idxChallenge(key = 'okta_email') {
  return idxForm(
    'challenge-authenticator',
    [
      {
        name: 'credentials',
        type: 'object',
        required: true,
        form: {
          value: [
            {
              name: 'passcode',
              required: true,
              secret: key === 'okta_password',
            },
          ],
        },
      },
    ],
    key,
  );
}

export function idxRegistration() {
  return idxForm('enroll-profile', [
    {
      name: 'userProfile',
      type: 'object',
      form: {
        value: [
          { name: 'email', required: true },
          { name: 'firstName', required: true },
          { name: 'lastName', required: true },
          {
            name: 'acmeState',
            type: 'string',
            required: true,
            options: [
              {
                label: 'display',
                value: {
                  type: 'object',
                  value: {
                    inputType: 'select',
                    options: [
                      { label: 'Missouri', value: 'MO' },
                      { label: 'Texas', value: 'TX' },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      name: 'credentials',
      type: 'object',
      form: { value: [{ name: 'passcode', secret: true, required: true }] },
    },
  ]);
}

export function stubIdxTransport(client: OktaAuth, responses: object[]) {
  // Only transport is stubbed: SDK PKCE, ION parsing and remediators run unchanged.
  const request = jest.fn(async (_method, url, options) => {
    expect(options).toBeDefined();
    let body;
    if (url.endsWith('/.well-known/openid-configuration')) {
      body = { code_challenge_methods_supported: ['S256'] };
    } else if (url.endsWith('/v1/interact')) {
      body = { interaction_handle: 'fixture-interaction-handle' };
    } else {
      body = responses.shift();
      if (!body) throw new Error(`Unexpected fixture request: ${url}`);
    }
    return {
      status: 200,
      responseText: JSON.stringify(body),
      headers: { 'content-type': 'application/ion+json; okta-version=1.0.0' },
    };
  });
  client.options.httpRequestClient = request;
  return request;
}
