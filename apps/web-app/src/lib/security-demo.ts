export function isSecurityInspectorEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ACME_ENABLE_SECURITY_INSPECTOR === 'true'
  );
}
