export function isSecurityInspectorEnabled(): boolean {
  return process.env.ACME_ENABLE_SECURITY_INSPECTOR === 'true';
}
