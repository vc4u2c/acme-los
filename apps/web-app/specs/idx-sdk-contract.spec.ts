import { createIdxAuthClient } from '@acme-los/auth/web';
import {
  idxChallenge,
  idxFixtureConfig,
  idxForm,
  stubIdxTransport,
} from './support/idx-sdk-fixture';

describe('installed Auth JS IDX contract', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it.each([0, 300, undefined])(
    'sends the server PKCE and maxAge=%s without creating a browser verifier',
    async (maxAgeSeconds) => {
      const client = createIdxAuthClient({
        ...idxFixtureConfig,
        maxAgeSeconds,
      });
      const request = stubIdxTransport(client, [
        idxForm('identify', [{ name: 'identifier', required: true }]),
      ]);
      const result = await client.idx.start({ nonce: idxFixtureConfig.nonce });
      const interact = request.mock.calls.find(([, url]) =>
        url.endsWith('/v1/interact'),
      );
      const params = new URLSearchParams(interact?.[2].data as string);
      expect(params.get('code_challenge')).toBe(idxFixtureConfig.codeChallenge);
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(params.get('state')).toBe(idxFixtureConfig.state);
      expect(params.get('nonce')).toBe(idxFixtureConfig.nonce);
      expect(params.get('max_age')).toBe(
        maxAgeSeconds === undefined ? null : String(maxAgeSeconds),
      );
      expect(result.meta?.codeVerifier).toBeUndefined();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(result.tokens).toBeUndefined();
    },
  );

  it('starts a fresh server transaction instead of reusing a previous interaction', async () => {
    for (const suffix of ['first', 'restart']) {
      const client = createIdxAuthClient({
        ...idxFixtureConfig,
        state: `fixture-state-${suffix}`,
        codeChallenge: `fixture-challenge-${suffix}`,
        acrValues: 'urn:okta:loa:2fa:any',
      });
      const request = stubIdxTransport(client, [
        idxForm('identify', [{ name: 'identifier', required: true }]),
      ]);
      await client.idx.start({ nonce: `fixture-nonce-${suffix}` });
      const interact = request.mock.calls.find(([, url]) =>
        url.endsWith('/v1/interact'),
      );
      const params = new URLSearchParams(interact?.[2].data as string);
      expect(params.get('code_challenge')).toBe(`fixture-challenge-${suffix}`);
      expect(params.get('state')).toBe(`fixture-state-${suffix}`);
      expect(params.get('nonce')).toBe(`fixture-nonce-${suffix}`);
      expect(params.get('acr_values')).toBe('urn:okta:loa:2fa:any');
    }
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it.each(['okta_email', 'okta_password'])(
    'exposes typed %s fields and maps submissions to ION credentials',
    async (key) => {
      const client = createIdxAuthClient(idxFixtureConfig);
      const challenge = idxChallenge(key);
      const request = stubIdxTransport(client, [
        idxForm('identify', [{ name: 'identifier', required: true }]),
        challenge,
        challenge,
      ]);
      await client.idx.start();
      const result = await client.idx.proceed({
        step: 'identify',
        username: 'fixture@example.com',
      });
      expect(result.nextStep?.inputs?.[0].name).toBe('credentials');
      const step = result.availableSteps?.find(
        (candidate) => candidate.name === 'challenge-authenticator',
      );
      const field = key === 'okta_password' ? 'password' : 'verificationCode';
      expect(step?.inputs?.[0].name).toBe(field);
      if (!step) throw new Error('SDK did not expose the challenge step');
      await client.idx.proceed({ step: step.name, [field]: 'fixture-value' });
      const submission = request.mock.calls.at(-1)?.[2].data;
      expect(JSON.parse(submission as string).credentials).toEqual({
        passcode: 'fixture-value',
      });
    },
  );
});
