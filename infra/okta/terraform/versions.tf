terraform {
  required_version = ">= 1.8.5"

  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 6.5.0"
    }
  }
}
