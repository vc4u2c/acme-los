output "web_app_id" {
  value = okta_app_oauth.web.id
}

output "web_app_client_id" {
  value = okta_app_oauth.web.client_id
}

output "mobile_app_id" {
  value = okta_app_oauth.mobile.id
}

output "mobile_app_client_id" {
  value = okta_app_oauth.mobile.client_id
}

output "default_brand_id" {
  value = var.manage_hosted_branding ? okta_brand.default_brand[0].id : ""
}

output "default_theme_id" {
  value = var.manage_hosted_branding ? okta_theme.default_theme[0].id : ""
}
