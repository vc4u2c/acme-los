# Auth and API Contract Documentation

This document defines the default authentication and contract strategy for the ACME LOS monorepo.

## Authentication Strategy

Recommended default:

- OpenID Connect / OAuth 2.1 compatible identity provider
- short-lived access tokens
- refresh token flow handled by the backend or secure platform-specific storage policy

## Web App Auth

`apps/web-app` should prefer:

- server-aware auth flows
- secure HTTP-only session cookies when possible
- middleware or server-side route protection for authenticated areas

Recommended split:

- authentication state orchestration in app code
- token/session types in `@acme-los/api/contracts` or `@acme-los/core/types`
- reusable auth helpers in a future `libs/core/auth` or `libs/api/client`

## Mobile App Auth

`apps/mobile-app` should prefer:

- PKCE-capable login flow
- secure token storage
- no long-lived secrets embedded in the app bundle

Recommended mobile rules:

- treat the mobile app as a public client
- never hardcode API secrets
- rotate and revoke refresh tokens where supported

## Authorization

Recommended baseline roles:

- borrower
- loan-officer
- processor
- underwriter
- admin

Recommended claims or derived permissions:

- tenant access
- application access scope
- servicing or underwriting permissions
- feature flags by role

## API Contract Boundaries

Use `@acme-los/api/contracts` for transport contracts only.

Place here:

- request and response DTOs
- pagination envelopes
- API error shapes
- auth/session payloads
- versioned contract types

Do not place here:

- UI component props
- app-local form state
- business rule implementations

Use `@acme-los/domain/*` for business models and invariants.

## Versioning

Recommended contract rules:

- version breaking contract changes explicitly
- keep DTO names stable and explicit
- prefer additive evolution over mutation

Examples:

- `CreateApplicationRequest`
- `CreateApplicationResponse`
- `ApplicationSummaryDto`
- `UnderwritingDecisionDto`
- `ApiErrorDto`

## Error Shape

Recommended common error envelope:

```ts
type ApiErrorDto = {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
};
```

Recommended characteristics:

- machine-readable `code`
- human-readable `message`
- correlation field such as `requestId`
- optional structured `details`

## Sensitive Data Rules

Never expose in logs or broad client payloads:

- SSN
- bank account numbers
- tax identifiers
- raw uploaded document contents
- access tokens
- refresh tokens

Prefer:

- masked identifiers
- internal entity IDs
- correlation IDs
- status and workflow metadata

## Suggested Next Libraries

Good next additions after this backbone:

- `libs/core/auth`
- `libs/core/request-context`
- `libs/api/http`
- `libs/api/auth-client`
