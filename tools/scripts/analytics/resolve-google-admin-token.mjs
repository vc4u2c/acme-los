import fs from 'node:fs';
import path from 'node:path';

function optionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveGoogleAdminToken({ required = false } = {}) {
  const environmentToken =
    optionalString(process.env.GOOGLE_ANALYTICS_ADMIN_TOKEN) ??
    optionalString(process.env.GOOGLE_ADMIN_ACCESS_TOKEN);

  if (environmentToken) {
    return {
      source: 'environment',
      token: environmentToken,
    };
  }

  const tokenFile = optionalString(process.env.ACME_GOOGLE_ADMIN_TOKEN_FILE);

  if (tokenFile) {
    const resolvedTokenFile = path.resolve(tokenFile);

    if (!fs.existsSync(resolvedTokenFile)) {
      throw new Error(
        `ACME_GOOGLE_ADMIN_TOKEN_FILE points to a missing file: ${resolvedTokenFile}`,
      );
    }

    const fileToken = optionalString(
      fs.readFileSync(resolvedTokenFile, 'utf8'),
    );

    if (!fileToken) {
      throw new Error(
        `ACME_GOOGLE_ADMIN_TOKEN_FILE points to an empty file: ${resolvedTokenFile}`,
      );
    }

    return {
      source: resolvedTokenFile,
      token: fileToken,
    };
  }

  if (required) {
    throw new Error(
      'Set GOOGLE_ANALYTICS_ADMIN_TOKEN, GOOGLE_ADMIN_ACCESS_TOKEN, or ACME_GOOGLE_ADMIN_TOKEN_FILE before running Google analytics admin automation.',
    );
  }

  return {
    source: 'none',
    token: '',
  };
}
