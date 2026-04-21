# Server-Side Auth Flows

This doc describes how authentication and route-level authorization work in the current web app.

This is the current implementation, not just target architecture.

Related docs:

- [Current platform architecture](./current-platform.md)
- [Auth and API contracts](./auth-and-api-contracts.md)
- [Okta admin plane](../../infra/okta/README.md)

## What Exists Today

The web app now uses:

- server-side PKCE initiation
- server-side callback exchange
- one opaque auth session cookie
- server-side session state
- server-enforced idle session expiry
- route-level assurance checks
- server-driven logout

The browser should not be the source of truth for authenticated state.

## Main Cookies

Current browser-side auth shape:

- `acme-los.auth-session`
  - opaque session id only
- `acme-los.csrf-token`
  - protects mutating web requests
- short-lived auth transaction cookie
  - only during the Okta redirect handshake

So the browser has one main logged-in session boundary, and the server resolves the real auth/session data behind it.

## Session Idle Timeout

Authenticated web sessions now have both an absolute expiry and a server-side
idle expiry.

- the absolute expiry is capped by the verified Okta ID token `exp`
- the idle expiry is stored with the server-side session record
- `GET /api/auth/session` reports the current session timing to the client
- `POST /api/auth/session/touch` is CSRF-protected and extends only the idle
  expiry, never beyond the absolute expiry
- browser background reads do not extend the session
- the client shows a warning modal before idle expiry and signs out when the
  server idle window is exhausted
- the effective active session expiry is the earlier of the idle expiry and the
  absolute token-backed expiry
- Redis/file session records and the opaque auth cookie are retained briefly
  after that active expiry only so `/api/auth/logout` can still read the logout
  ID-token hint and clear the Okta browser session; retained records do not
  authenticate app requests or allow keep-alive touches
- if Okta issues a refresh token, it stays server-side and is used only during
  the CSRF-protected touch path when the token set is near expiry; the browser
  never receives it
- a successful server-side refresh verifies the new ID token, updates the
  server token set, and extends the idle expiry without bypassing the active
  session checks
- a successful hosted sign-in callback, including route-level step-up, writes a
  replacement server auth session and retires the prior server auth-session
  record; application-flow state remains keyed by the customer identity rather
  than by the old token set
- route-level step-up captures the current user id in the auth transaction,
  asks Okta for a fresh login/assurance check, and rejects callbacks that return
  a token for a different subject

Current defaults:

- `local` and Azure `dev`: 120 second idle timeout with a 30 second warning
- `qa`, `stg`, and `prod`: 15 minute idle timeout with a 2 minute warning

The dev value is intentionally short so the modal and server expiry path are
easy to test.

## Sign-In Flow

This is the normal hosted Okta sign-in path for the web app.

```mermaid
sequenceDiagram
  autonumber
  actor U as User Browser
  participant W as Next Web App
  participant O as Okta
  participant S as Server State Store

  U->>W: GET /account/sign-in?returnTo=/apply/personal-info
  W->>U: Render sign-in launch page
  U->>W: GET /api/auth/start?returnTo=/apply/personal-info
  W->>W: Generate state, nonce, code_verifier, code_challenge
  W->>U: Set auth transaction cookie
  W->>U: Redirect to Okta authorize endpoint
  U->>O: Hosted sign-in
  O->>U: Redirect back to /auth/callback with code + state
  U->>W: GET /auth/callback?code=...&state=...
  W->>U: Immediate redirect to /api/auth/callback
  U->>W: GET /api/auth/callback?code=...&state=...
  W->>W: Read and verify auth transaction cookie
  W->>O: Exchange code for tokens
  O-->>W: id_token, access_token, refresh_token?
  W->>W: Verify nonce and token claims
  W->>S: Create server-side auth session
  W->>U: Set opaque auth session cookie
  W->>U: Clear auth transaction cookie
  W->>U: Redirect to returnTo
```

The small `/auth/callback` page is just a handoff route. The real code exchange
and session write happen in `/api/auth/callback`.

## Guarded Route Flow

Guarded routes like `/apply/*` and `/account/profile` check the server session before rendering.

```mermaid
sequenceDiagram
  autonumber
  actor U as User Browser
  participant W as Next Web App
  participant S as Server State Store

  U->>W: GET /apply/personal-info
  W->>W: Read opaque auth cookie
  W->>S: Resolve session by sessionId
  alt no session
    W->>U: Redirect /account/sign-in?returnTo=/apply/personal-info
  else session exists
    W->>W: Check requiresAuthentication
    W->>W: Check minimumAssuranceLevel
    alt assurance too low
      W->>U: Redirect to sign-in / step-up path
    else allowed
      W->>U: Render server route shell
    end
  end
```

## Authorization Model

Today, authorization is mostly route- and assurance-based rather than role-heavy.

Examples:

- public marketing routes
  - no auth required
- `/account/profile`
  - authenticated session required
- most `/apply/*`
  - authenticated session required
- funding-sensitive routes
  - stronger assurance required

### Route-Level Decision

```mermaid
flowchart TD
  A[Request arrives] --> B{Has valid session?}
  B -- No --> C[Redirect to hosted sign-in]
  B -- Yes --> D{Route requires stronger assurance?}
  D -- No --> E[Render route]
  D -- Yes --> F{Session meets required AAL?}
  F -- No --> G[Redirect to step-up sign-in]
  F -- Yes --> E
```

## Shared Session Across Profile And Apply

The profile routes and apply routes use the same main authenticated session.

That means:

- no separate profile auth token
- no separate apply auth token
- sign-out clears the same main session

```mermaid
flowchart LR
  C[Opaque auth cookie] --> S[Server session record]
  S --> P["/account/profile"]
  S --> A["/apply/*"]
  S --> L["/api/auth/logout"]
```

## Sign-Out Flow

Sign-out is server-owned too.

```mermaid
sequenceDiagram
  autonumber
  actor U as User Browser
  participant W as Next Web App
  participant S as Server State Store
  participant O as Okta

  U->>W: POST or GET sign-out trigger
  W->>W: Read opaque auth cookie
  W->>S: Load session and token metadata
  W->>S: Delete server-side session
  W->>U: Clear auth cookie and related web cookies
  W->>U: Redirect to Okta logout
  U->>O: Hosted logout
  O->>U: Redirect back to post-logout route
```

## Where Authorization Lives

Authentication and authorization decisions are split like this:

- identity and primary login
  - Okta
- callback validation and session creation
  - Next server
- guarded route checks
  - Next server
- assurance-level decisions for sensitive routes
  - Next server runtime
- domain/business permissions
  - future backend / BFF concern as the system grows

## Why This Matters

This structure gives us:

- safer browser boundaries
- cleaner migration path to a .NET BFF
- one shared session model across the signed-in web experience
- fewer chances for client-side auth drift

## Next Diagrams Worth Adding Later

Good future additions:

- funding step-up detail flow
- mobile auth flow once Okta mobile integration is live
- Redis vs file fallback state resolution
- future .NET BFF replacement flow
