import { Resolver } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

const publicResolver = new Resolver({ timeout: 5000, tries: 2 });
publicResolver.setServers(['1.1.1.1', '8.8.8.8']);

export async function getPublicNameServers(zone, resolver = publicResolver) {
  try {
    return { zone, nameServers: await resolver.resolveNs(zone) };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return { zone, nameServers: [] };
    }
    throw error;
  }
}

export async function verifyPublicDns(
  hostname,
  expectedTarget,
  verificationId,
  resolver = publicResolver,
) {
  const targets = await resolver.resolveCname(hostname);
  const records = await resolver.resolveTxt(`asuid.${hostname}`);
  const normalize = (name) => name.toLowerCase().replace(/\.$/, '');
  if (
    targets.length !== 1 ||
    normalize(targets[0]) !== normalize(expectedTarget) ||
    !records.some((chunks) => chunks.join('') === verificationId)
  ) {
    throw new Error('Public DNS does not match the current Azure app.');
  }
  return { status: 'dns-verified', hostname };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === 'zone') {
      console.log(JSON.stringify(await getPublicNameServers(args[1])));
    } else {
      if (args.length !== 3)
        throw new Error('Expected hostname, target, and TXT.');
      console.log(JSON.stringify(await verifyPublicDns(...args)));
    }
  } catch {
    console.log(JSON.stringify({ status: 'dns-unverified' }));
    process.exitCode = 1;
  }
}
