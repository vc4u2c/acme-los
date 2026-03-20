locals {
  use_api_token = trimspace(var.okta_api_token) != ""

  okta_provider_scopes_base = [
    "okta.apps.manage",
    "okta.apps.read",
  ]

  okta_provider_scopes = var.manage_hosted_branding ? concat(
    local.okta_provider_scopes_base,
    [
      "okta.brands.manage",
      "okta.brands.read",
    ],
  ) : local.okta_provider_scopes_base

  okta_private_key = local.use_api_token ? null : (
    trimspace(var.okta_api_private_key_pem) != "" ? trimspace(var.okta_api_private_key_pem) : file(var.okta_api_private_key_path)
  )
}

provider "okta" {
  org_name    = var.okta_org_name
  base_url    = var.okta_base_url
  api_token   = local.use_api_token ? var.okta_api_token : null
  client_id   = local.use_api_token ? null : var.okta_api_service_client_id
  private_key = local.okta_private_key
  scopes      = local.use_api_token ? null : local.okta_provider_scopes
}
