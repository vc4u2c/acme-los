import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPublicNameServers,
  verifyPublicDns,
} from '../verify-public-dns.mjs';

const hostname = 'apply-dev.example.test';
const target = 'app.new-env.centralus.azurecontainerapps.io';
const verification = 'A'.repeat(64);
const resolver = (targets = [target], txt = [[verification]]) => ({
  async resolveCname(name) {
    assert.equal(name, hostname);
    return targets;
  },
  async resolveTxt(name) {
    assert.equal(name, `asuid.${hostname}`);
    return txt;
  },
});

test('NS lookup returns the assigned nameservers', async () => {
  const result = await getPublicNameServers('los.example.test', {
    async resolveNs(zone) {
      assert.equal(zone, 'los.example.test');
      return ['ns1.example.test'];
    },
  });
  assert.deepEqual(result.nameServers, ['ns1.example.test']);
});
test('only authoritative no-data errors mean no delegation', async () => {
  for (const code of ['ENOTFOUND', 'ENODATA']) {
    const result = await getPublicNameServers('los.example.test', {
      async resolveNs() {
        throw Object.assign(new Error('DNS failure'), { code });
      },
    });
    assert.deepEqual(result.nameServers, []);
  }
  for (const code of ['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL']) {
    await assert.rejects(
      getPublicNameServers('los.example.test', {
        async resolveNs() {
          throw Object.assign(new Error('DNS failure'), { code });
        },
      }),
    );
  }
});

test('verifies exact CNAME and TXT using cross-platform Node DNS', async () => {
  assert.deepEqual(
    await verifyPublicDns(hostname, target, verification, resolver()),
    { status: 'dns-verified', hostname },
  );
});
test('handles DNS case/trailing dot and split TXT strings', async () => {
  await verifyPublicDns(
    hostname,
    target,
    verification,
    resolver([`${target.toUpperCase()}.`], [['A'.repeat(32), 'A'.repeat(32)]]),
  );
});
test('rejects stale targets after environment recreation', async () => {
  await assert.rejects(
    verifyPublicDns(
      hostname,
      target,
      verification,
      resolver(['app.old-env.centralus.azurecontainerapps.io']),
    ),
  );
});
test('rejects missing or ambiguous CNAME records', async () => {
  for (const targets of [[], [target, target]]) {
    await assert.rejects(
      verifyPublicDns(hostname, target, verification, resolver(targets)),
    );
  }
});
test('rejects missing or wrong TXT without merging separate TXT records', async () => {
  for (const records of [
    [],
    [['wrong']],
    [['A'.repeat(32)], ['A'.repeat(32)]],
  ]) {
    await assert.rejects(
      verifyPublicDns(
        hostname,
        target,
        verification,
        resolver([target], records),
      ),
    );
  }
});
test('resolver failures do not report verification success', async () => {
  await assert.rejects(
    verifyPublicDns(hostname, target, verification, {
      async resolveCname() {
        throw new Error('ENOTFOUND');
      },
    }),
  );
});
