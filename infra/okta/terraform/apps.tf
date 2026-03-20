# Keep the Terraform write surface narrow until the Okta provider's
# service-app OAuth path is proven reliable for broader admin-plane resources.
# This slice owns only the application integrations themselves.

resource "okta_app_oauth" "web" {
  label                     = var.web_app_name
  type                      = "web"
  grant_types               = ["authorization_code", "refresh_token"]
  response_types            = ["code"]
  redirect_uris             = [var.web_redirect_uri]
  post_logout_redirect_uris = [var.web_post_logout_redirect_uri]
  omit_secret               = true
  consent_method            = "TRUSTED"
  tos_uri                   = var.branding.terms_url
  policy_uri                = var.branding.privacy_policy_url
}

resource "okta_app_oauth" "mobile" {
  label                     = var.mobile_app_name
  type                      = "native"
  grant_types               = ["authorization_code", "refresh_token"]
  response_types            = ["code"]
  redirect_uris             = [var.mobile_redirect_uri]
  post_logout_redirect_uris = [var.mobile_redirect_uri]
  omit_secret               = true
  consent_method            = "TRUSTED"
  tos_uri                   = var.branding.terms_url
  policy_uri                = var.branding.privacy_policy_url
}
