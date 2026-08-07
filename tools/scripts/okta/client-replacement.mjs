const managedOAuthClientProperties = [
  'application_type',
  'client_uri',
  'grant_types',
  'initiate_login_uri',
  'logo_uri',
  'policy_uri',
  'post_logout_redirect_uris',
  'redirect_uris',
  'response_types',
  'tos_uri',
];

function readDesiredAuthMethod(desiredApplication) {
  return desiredApplication?.credentials?.oauthClient
    ?.token_endpoint_auth_method;
}

export function buildOAuthClientReplacementPayload(
  existingClient,
  desiredApplication,
) {
  if (!existingClient?.client_id) {
    throw new Error(
      'A complete Okta OAuth client resource is required to build a replacement payload.',
    );
  }

  const currentAuthMethod = existingClient.token_endpoint_auth_method;
  const desiredAuthMethod = readDesiredAuthMethod(desiredApplication);

  if (desiredAuthMethod && currentAuthMethod !== desiredAuthMethod) {
    throw new Error(
      `Refusing to replace Okta OAuth client "${existingClient.client_name ?? existingClient.client_id}": token endpoint authentication method drift requires an explicit credential migration (${currentAuthMethod ?? 'missing'} -> ${desiredAuthMethod}).`,
    );
  }

  const replacement = structuredClone(existingClient);
  delete replacement.client_id_issued_at;
  delete replacement.client_secret;
  delete replacement.client_secret_expires_at;
  const desiredOAuthClient = desiredApplication?.settings?.oauthClient ?? {};

  replacement.client_name = desiredApplication.label;
  replacement.token_endpoint_auth_method =
    desiredAuthMethod ?? currentAuthMethod;

  for (const property of managedOAuthClientProperties) {
    if (Object.hasOwn(desiredOAuthClient, property)) {
      replacement[property] = structuredClone(desiredOAuthClient[property]);
    }
  }

  return replacement;
}
