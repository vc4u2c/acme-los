import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const signing = require('@expo/code-signing-certificates');
const signingRequire = createRequire(
  require.resolve('@expo/code-signing-certificates'),
);
const forge = signingRequire('node-forge');

test('Expo owners resolve the security-serviced Forge release', () => {
  for (const owner of ['@expo/cli', '@expo/code-signing-certificates']) {
    const ownerRequire = createRequire(require.resolve(owner));
    assert.ok(
      require('semver').gte(
        ownerRequire('node-forge/package.json').version,
        '1.4.3',
      ),
      `${owner} must resolve the patched Forge release`,
    );
  }
});

test('Expo certificate signing verifies valid data and rejects tampering', () => {
  // Keys are ephemeral test data, never persisted or logged.
  const keyPair = signing.generateKeyPair();
  const certificate = signing.generateSelfSignedCodeSigningCertificate({
    keyPair,
    validityNotBefore: new Date(Date.now() - 60_000),
    validityNotAfter: new Date(Date.now() + 3_600_000),
    commonName: 'ACME dependency compatibility test',
  });
  const roundTrip = signing.convertCertificatePEMToCertificate(
    signing.convertCertificateToCertificatePEM(certificate),
  );
  assert.doesNotThrow(() =>
    signing.validateSelfSignedCertificate(roundTrip, keyPair),
  );
  const payload = Buffer.from('dependency compatibility test');
  const signature = forge.util.decode64(
    signing.signBufferRSASHA256AndVerify(
      keyPair.privateKey,
      roundTrip,
      payload,
    ),
  );
  const digest = forge.md.sha256.create().update(payload.toString('binary'));
  assert.equal(
    roundTrip.publicKey.verify(digest.digest().getBytes(), signature),
    true,
  );
  const changed = forge.md.sha256.create().update('changed payload');
  assert.equal(
    roundTrip.publicKey.verify(changed.digest().getBytes(), signature),
    false,
  );
});

test('RSA verification rejects extra nested DigestAlgorithm elements', () => {
  const { asn1, pki, md } = forge;
  const { publicKey, privateKey } = pki.rsa.generateKeyPair({ bits: 2048 });
  const digest = md.sha256
    .create()
    .update('digest structure regression')
    .digest()
    .getBytes();
  const node = (type, constructed, value) =>
    asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const algorithm = node(asn1.Type.SEQUENCE, true, [
    node(asn1.Type.OID, false, asn1.oidToDer(pki.oids.sha256).getBytes()),
    node(asn1.Type.NULL, false, ''),
  ]);
  const digestInfo = node(asn1.Type.SEQUENCE, true, [
    algorithm,
    node(asn1.Type.OCTETSTRING, false, digest),
  ]);
  const signDigestInfo = () =>
    privateKey.sign(asn1.toDer(digestInfo).getBytes(), null);
  assert.equal(publicKey.verify(digest, signDigestInfo()), true);
  algorithm.value.push(node(asn1.Type.OCTETSTRING, false, 'unexpected data'));
  const malformedSignature = signDigestInfo();
  assert.throws(
    () => publicKey.verify(digest, malformedSignature),
    /DigestInfo/,
  );
});
