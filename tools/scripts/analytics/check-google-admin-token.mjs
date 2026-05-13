#!/usr/bin/env node
import { resolveGoogleAdminToken } from './resolve-google-admin-token.mjs';

try {
  const result = resolveGoogleAdminToken({ required: true });
  console.log('Resolved Google analytics admin token.');
  console.log(`- Source: ${result.source}`);
  console.log(`- Length: ${result.token.length}`);
  console.log('- Token value: not printed');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
