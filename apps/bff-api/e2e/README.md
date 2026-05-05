# ACME LOS BFF E2E

This folder is reserved for black-box BFF tests that run against a started
process over HTTP.

Start here with:

- route smoke tests for `/health/*`, `/bff/health`, and `/openapi/v1.json`
- contract checks for `customer` and `application` slices through the running
  host
- later, Redis-backed and auth-bridge integration coverage when the local stack
  includes the Next facade and shared session/CSRF configuration
