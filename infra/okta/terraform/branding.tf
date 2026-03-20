data "okta_brands" "all_brands" {
  count = var.manage_hosted_branding ? 1 : 0
}

data "okta_brand" "default_brand_data" {
  count    = var.manage_hosted_branding ? 1 : 0
  brand_id = tolist(data.okta_brands.all_brands[0].brands)[0].id
}

data "okta_themes" "default_brand_themes" {
  count    = var.manage_hosted_branding ? 1 : 0
  brand_id = data.okta_brand.default_brand_data[0].id
}

resource "okta_brand" "default_brand" {
  count = var.manage_hosted_branding ? 1 : 0

  name                           = var.branding.brand_name
  locale                         = "en"
  remove_powered_by_okta         = true
  agree_to_custom_privacy_policy = true
  custom_privacy_policy_url      = var.branding.privacy_policy_url
  default_app_app_instance_id    = okta_app_oauth.web.id
  default_app_app_link_name      = "installment-flow"
}

resource "okta_theme" "default_theme" {
  count = var.manage_hosted_branding ? 1 : 0

  brand_id = data.okta_brand.default_brand_data[0].id
  theme_id = tolist(data.okta_themes.default_brand_themes[0].themes)[0].id

  logo                         = var.branding.logo_url
  favicon                      = var.branding.favicon_url
  primary_color_hex            = var.branding.primary_color
  primary_color_contrast_hex   = var.branding.primary_contrast_color
  secondary_color_hex          = var.branding.surface_color
  secondary_color_contrast_hex = var.branding.text_color

  sign_in_page_touch_point_variant       = "OKTA_DEFAULT"
  end_user_dashboard_touch_point_variant = "OKTA_DEFAULT"
  error_page_touch_point_variant         = "OKTA_DEFAULT"
  email_template_touch_point_variant     = "OKTA_DEFAULT"
}
