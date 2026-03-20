variable "okta_api_service_client_id" {
  type        = string
  description = "Client ID for the Okta API service app Terraform uses to manage the org."
  default     = ""
  sensitive   = true
}

variable "okta_api_private_key_path" {
  type        = string
  description = "Absolute path to the PEM private key used by the Okta API service app."
  default     = ""
  sensitive   = true
}

variable "okta_api_private_key_pem" {
  type        = string
  description = "Optional PEM private key contents. Use this instead of okta_api_private_key_path in CI."
  default     = ""
  sensitive   = true
}

variable "okta_api_token" {
  type        = string
  description = "Optional SSWS API token for local bootstrap or CI admin provisioning."
  default     = ""
  sensitive   = true
}

variable "okta_org_name" {
  type        = string
  description = "Okta org subdomain, derived from the issuer host."
}

variable "okta_base_url" {
  type        = string
  description = "Base Okta domain such as okta.com."
}

variable "environment_name" {
  type        = string
  description = "Deployment environment slug, for example dev or prod."
}

variable "issuer" {
  type        = string
  description = "Authorization server issuer used by the web and mobile clients."
}

variable "web_base_url" {
  type        = string
  description = "Base URL for the ACME LOS web app."
}

variable "web_redirect_uri" {
  type        = string
  description = "Hosted Okta redirect callback URL for the web app."
}

variable "web_post_logout_redirect_uri" {
  type        = string
  description = "Post-logout redirect URL for the web app."
}

variable "mobile_redirect_uri" {
  type        = string
  description = "Native redirect URI for the mobile app."
}

variable "funding_step_up_acr_values" {
  type        = string
  description = "acr_values string used by the funding route for step-up authentication."
}

variable "web_app_name" {
  type        = string
  description = "Display label for the ACME LOS web SPA app integration."
}

variable "mobile_app_name" {
  type        = string
  description = "Display label for the ACME LOS mobile native app integration."
}

variable "customer_group_name" {
  type        = string
  description = "Customer group reserved for future profile-enrollment and app-assignment work."
}

variable "trusted_origin_name" {
  type        = string
  description = "Display name for the trusted origin that covers the web app host."
}

variable "manage_hosted_branding" {
  type        = bool
  description = "Whether Terraform should manage Okta hosted branding directly. Disabled by default because the Okta provider has OAuth service-app gaps for branding resources."
}

variable "hosted_experience" {
  description = "Git-tracked Okta hosted-flow intent shared across environments."
  type = object({
    remember_user                           = bool
    keep_me_signed_in                       = bool
    registration_requires_email_verification = bool
    registration_requires_phone_verification = bool
    adaptive_mfa_on_sign_in                 = bool
    funding_route_step_up                   = bool
  })
}

variable "branding" {
  description = "Hosted Okta branding values aligned to the ACME LOS design system."
  type = object({
    brand_name             = string
    product_name           = string
    support_phone          = string
    support_hours          = string
    logo_url               = string
    favicon_url            = string
    primary_color          = string
    primary_contrast_color = string
    secondary_color        = string
    background_color       = string
    surface_color          = string
    text_color             = string
    muted_text_color       = string
    link_color             = string
    border_color           = string
    focus_color            = string
    accent_color           = string
    privacy_policy_url     = string
    terms_url              = string
    help_url               = string
    sign_in_title          = string
    sign_in_subtitle       = string
    sign_up_title          = string
    sign_up_subtitle       = string
  })
}
