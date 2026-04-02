# Current Platform Architecture

This doc is the current-state snapshot for the repo. It complements:

- [auth-server-flows.md](./auth-server-flows.md)
- [auth-and-api-contracts.md](./auth-and-api-contracts.md)
- [domain-boundaries.md](./domain-boundaries.md)
- [infra/okta/README.md](../../infra/okta/README.md)

## Product Surface

### Web

- public marketing and support routes
- guarded seven-step application flow under `/apply/[step]`
- customer dashboard under `/account/profile`
- hosted Okta sign-in and registration
- route-level funding step-up for stronger verification

### Mobile

- Expo app shell aligned to the web visual direction
- dashboard-oriented home experience
- shared release/version wiring through app config
- auth-ready structure for future Okta mobile integration

## Current Auth Shape

- public product entry points send users into the application flow
- signed-out profile entry goes to hosted Okta sign-in
- hosted Okta sign-in is also the registration path
- there is no separate local create-account page anymore
- signed-in profile entry goes to the customer dashboard
- funding uses stronger route-level auth requirements than the rest of the application

### MFA Model

- registration requires password plus email enrollment
- standard sign-in is password-first
- adaptive sign-in can step up to 2FA on high-risk access
- funding route access is step-up protected in application runtime with `acr_values`

## Current API Boundary

- `libs/api/contracts`
  - app-owned request and response shapes for `auth`, `customer`, and `application`
- `libs/api/web-client`
  - browser-safe wrappers that call the web app's own `/api/*` routes
  - handles CSRF-aware requests without exposing Okta or cookie internals to UI code
- `libs/api/domain-client`
  - server-side wrappers for domain-facing `customer` and `application` endpoints
  - this is the layer the Next facade can later point at a .NET BFF or legacy services through

## Current Server-State Model

- one opaque auth session cookie identifies the web session
- one CSRF cookie protects browser mutations
- one short-lived auth transaction cookie exists only during sign-in
- `libs/api/web-server`
  - stores auth session data, customer profile data, and application flow state server-side
  - uses Redis when `ACME_WEB_STATE_STORE=redis` or `ACME_REDIS_URL` is configured
  - otherwise falls back to a file-backed local store under `.next/cache/acme-los-web-state`

## Current Hardening Status

In place now:

- server-side PKCE initiation and callback exchange
- opaque HTTP-only auth session cookie
- tokens off the browser in the normal signed-in flow
- server-side guarded route checks
- CSRF on mutating web facade routes
- server-driven logout
- centralized server-side state for auth session, customer profile, and application flow
- rate limiting and audit logging on auth-sensitive routes
- explicit opt-in security inspector for demos

Still temporary by design:

- the security inspector route is demo-only and should stay opt-in outside local work
- the local file-backed store is a bridge fallback, not the final multi-instance production state path
- the future .NET BFF should still replace the Next facade implementations while preserving the contracts
- customer and application state still live in the web-server layer instead of a durable backend service

## BFF Direction

The web app is being shaped so the current server-side PKCE flow can later move behind a .NET BFF without rewriting the UI layer.

Planned BFF endpoints:

- `GET /bff/auth/login`
- `GET /bff/auth/callback`
- `POST /bff/auth/logout`
- `GET /bff/auth/session`

Near-term guidance:

- keep the current apply route shape
- keep server-rendered route shells with small client form islands
- keep UI code calling app-owned API contracts instead of auth or storage internals
- keep the Next API layer thin and focused on cookie/session handling, validation, and transport

## Practical Transition Checklist

### Phase 1: Freeze The Current Auth Slice

- keep the current `/apply/*` route shape
- keep server-rendered route shells
- keep client form islands focused on interaction only
- keep the web app using the opaque server-backed auth session cookie as the source of truth
- keep hosted Okta focused on sign-in, MFA, reset, and unlock flows

Definition of done:

- callback creates the secure web session reliably through the server-side PKCE flow
- guarded routes use server-side session checks
- sign-out clears both the app session and the Okta browser session

### Phase 2: Expand The Thin Next API Layer

- add or continue expanding route handlers under `apps/web-app/src/app/api/*`
- keep those handlers limited to:
  - cookie and session handling
  - CSRF validation
  - auth and assurance enforcement
  - request and response mapping
  - proxy behavior
- do not move long-term business logic into the Next route handlers

### Phase 3: Move Remaining Protected Web Actions Behind The Facade

- move authenticated customer and profile actions behind `/api/*`
- move any remaining web-only auth mutations behind `/api/*`
- keep shared contracts in `libs/api/contracts`
- keep browser wrappers in `libs/api/web-client`
- keep server-side customer and application wrappers in `libs/api/domain-client`

### Phase 4: Replace Temporary Persistence

- replace temporary server-backed customer profile persistence with backend persistence
- replace temporary server-backed application flow storage with backend persistence
- replace other web-only protected state assumptions where appropriate

### Phase 5: Security Hardening Pass

- review secure cookie settings across environments
- review CSRF coverage on all mutating web routes
- add rate limiting or abuse controls where needed
- add audit and security logging for sign-in, sign-out, and sensitive actions
- review env var and secret handling for production readiness
- review server-side assurance checks for standard and funding routes
- keep the security inspector route explicit and removable for non-demo environments
- prefer Redis or another durable shared state backend outside simple local development

### Phase 6: Prepare The .NET BFF Swap

- keep request and response contracts stable in `libs/api/contracts`
- keep the web client calling app-owned endpoints, not Okta internals
- keep the Next implementation thin enough that it can later proxy to or be replaced by .NET
- avoid baking Next-specific auth or session assumptions into shared UI or domain code

### Phase 7: Registration Rework When Unpaused

- stop relying on hosted Okta self-service registration as the final customer registration model
- build app-owned registration flow behind the server API layer
- keep temporary registration state in backend persistence
- create the Okta user only at the end of successful registration
- create the Okta user as `STAGED`
- include `leadId` and `customerId` in the final user creation path
