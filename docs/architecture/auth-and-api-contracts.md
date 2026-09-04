# Auth And API Contracts

This doc describes the contract and auth boundaries the repo uses today, plus
the rules we want to preserve as the backend evolves.

For the current implemented IDX, Interaction Code, session, and logout diagrams,
see [auth-server-flows.md](./auth-server-flows.md).

## What Exists Today

The current split is:

- `@acme-los/api/contracts`
  - transport contracts and shared DTOs
- `@acme-los/api/web-client`
  - browser-safe wrappers that call the web app's own `/api/*` routes
- `@acme-los/api/domain-client`
  - server-side customer/application transport layer
- `@acme-los/api/web-server`
  - server-only helpers for the Next web facade
- `@acme-los/auth/*`
  - auth contracts, core helpers, and web integration helpers

The browser uses app-owned endpoints for application APIs and auth transaction
start/completion. During IDX remediation, Auth JS sends credentials and OTPs
directly to Okta; the browser never talks to backend storage details.

The browser still talks to the same app-owned Next `/api/*` routes. The
difference is server-side only: the Next facade delegates real Okta-backed
auth/session, CSRF, customer profile, and application-flow routes to the `.NET`
BFF. Playwright uses a test-only BFF fixture that exercises the same Next
facade without adding a second authentication implementation to runtime code.

When `bffRuntime.serviceAuth.mode=entra` is enabled in Azure, the same
browser-facing contract remains stable. The Next facade adds a managed-identity
bearer token to its server-to-server BFF call, and the BFF validates tenant,
audience, lifetime, and allowed caller identity before `/bff/*` routes run.

## Web Auth Shape

The web app currently uses:

- server-generated PKCE, state, and nonce
- server-side Interaction Code exchange
- one opaque HTTP-only auth session cookie
- one CSRF cookie for mutating web routes
- one short-lived auth transaction cookie during the IDX transaction;
  it is an opaque pointer only, while `state`, `nonce`, `code_verifier`, and
  route context live in the server-side state store
- server-side session, customer, and application flow state
- server-enforced idle expiry for authenticated web sessions

Important rule:

- the browser is not the source of truth for authenticated state
- the client warning modal is UX only; the server-side idle expiry is the
  enforcement point

## Mobile Auth Direction

The mobile app is still earlier in its auth evolution than the web app.

Current design intent:

- treat mobile as a public client
- use PKCE-capable sign-in
- use secure token storage
- never embed client secrets in the app
- keep the mobile auth shape separate from the web session-cookie model

## API Client Split

### `@acme-los/api/contracts`

Owns:

- request and response DTOs
- auth/session payload shapes
- session timing payloads for idle warning and expiry UX
- error envelopes
- contract-level enums and unions

Must not own:

- UI component props
- app-local form state
- business rule implementations

### `@acme-los/api/web-client`

Owns:

- browser wrappers for the web app's `/api/*` facade
- CSRF-aware request behavior
- typed responses for browser code
- session keep-alive calls through the app-owned `/api/auth/session/touch`
  endpoint

Must not own:

- Okta SDK details
- browser storage decisions
- cookie manipulation
- domain/business logic

### `@acme-los/api/domain-client`

Owns:

- server-side customer and application transport calls
- the current bridge point to BFF and future backend endpoints

Must not own:

- browser concerns
- cookie/session concerns
- UI behavior

### `@acme-los/api/web-server`

Owns:

- auth/session helpers for the Next facade
- IDX start and Interaction Code completion support
- CSRF and cookie helpers
- BFF client helpers and trusted identity/service-auth headers
- server-side route checks that keep the browser contract stable while the BFF
  owns implementation authority

Must stay:

- server-only
- thin enough that the BFF can continue replacing backend behavior cleanly

### Authority Contract

| Contract                     | Current behavior                                                    |
| ---------------------------- | ------------------------------------------------------------------- |
| Browser API URLs             | Next `/api/*`                                                       |
| Browser cookie               | Opaque auth session cookie written by Next from BFF session headers |
| CSRF route                   | BFF issues token through Next facade                                |
| Auth/session source of truth | BFF state store for real Okta auth                                  |
| Security inspector           | Reads BFF-owned token/session snapshot through trusted diagnostics  |
| Mock auth                    | Local, token-free development/test fixture                          |
| Raw tokens                   | Never in normal browser storage                                     |
| Service-to-service identity  | Optional Entra managed-identity bearer auth in Azure                |

## Authorization Today

Authorization in the repo is mostly:

- route-level authentication
- route-level assurance checks
- thin session-based access control

Examples:

- public marketing routes
  - no session required
- `/account/profile`
  - authenticated session required
- most `/apply/*`
  - authenticated session required
- funding-sensitive routes
  - stronger assurance and fresh funding step-up required

That is different from a heavy role-based permission system. Deeper business
permissions still belong in the backend/BFF layer as that grows.

## Identity Claims Versus Session Fallback

This distinction matters in the current implementation.

- the raw decoded token payload only contains claims that Okta minted
- the web session can still contain fallback values added by the app during the sign-in flow

Current example:

- `customerId`
  - should ideally come from an Okta profile-backed claim or later from backend identity data
- `leadId`
  - can currently come from the sign-in transaction and be carried into the web session even if Okta did not mint `lead_id` into the token

That means the following can both be true:

- `session.user.leadId` exists
- the raw decoded JWT payload does not contain `lead_id`

Why this happens:

- Okta only emits `lead_id` and `customer_id` when those profile-backed values exist at token mint time
- the app can still attach a fallback `leadId` during session creation if the journey already knows it

Design guidance:

- use token claims for stable identity attributes
- use app or backend session state for journey-scoped context
- avoid treating a session fallback as proof that a raw JWT claim exists

## Contract Rules

Keep these rules stable:

- keep transport DTOs in `@acme-los/api/contracts`
- keep business invariants in `@acme-los/domain/*`
- keep app-local interaction state inside apps
- prefer additive contract evolution over breaking mutation
- keep DTO names explicit and boring

Examples:

- `GetSessionResponse`
- `SaveApplicationStepRequest`
- `SaveApplicationStepResponse`
- `CustomerProfile`
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

Good characteristics:

- machine-readable `code`
- human-readable `message`
- correlation field such as `requestId`
- optional structured `details`

## Sensitive Data Rules

Never expose broadly in logs or client payloads:

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

The security inspector is the explicit exception for local/dev troubleshooting.
It is authenticated, rate-limited by the Next facade, disabled outside local/dev
unless explicitly enabled, and must read from whichever server-side authority is
active. It should not become a production support surface.

## Evolution Guidance

As more behavior moves into the BFF:

- keep UI code calling app-owned contracts
- keep the web facade thin
- keep customer and application contracts shaped around the product flow, not
  raw backend endpoints
- keep auth/session concerns separate from domain data models
