# Next Web Server And Client Boundaries

This doc explains how the Next.js web app is currently split between server components and client components, and how to keep that split understandable.

Related docs:

- [Current platform architecture](./current-platform.md)
- [Server-side auth flows](./auth-server-flows.md)
- [Auth and API contracts](./auth-and-api-contracts.md)

## The Simple Rule

Use:

- server components for route shells, data loading, auth checks, and composition
- client components for interactive UI, hooks, local state, and browser-only behavior

That is the intended end state for this repo.

## What Lives On The Server Today

Good examples of server-rendered pieces:

- route entry files under `apps/web-app/src/app/**/page.tsx`
- guarded route shells like:
  - `apps/web-app/src/app/apply/[step]/page.tsx`
  - `apps/web-app/src/app/account/profile/page.tsx`
- API routes under `apps/web-app/src/app/api/**/route.ts`

Server responsibilities:

- auth/session checks
- redirects
- initial data fetch or initial state shaping
- rendering the shell around the interactive island

## What Lives On The Client Today

Current explicit client components:

- `apps/web-app/src/components/web/customer-profile-dashboard.tsx`
- `apps/web-app/src/components/web/customer-auth-launch-page.tsx`
- `apps/web-app/src/components/web/theme-toggle.tsx`
- `apps/web-app/src/components/web/start-application-button.tsx`
- `apps/web-app/src/components/web/site-header.tsx`
- `apps/web-app/src/components/web/profile-menu.tsx`
- `apps/web-app/src/components/web/site-alert-strip.tsx`
- `apps/web-app/src/components/web/security-inspector-dashboard.tsx`
- `apps/web-app/src/components/web/providers/app-providers.tsx`
- `apps/web-app/src/components/web/providers/lead-id-tracker.tsx`
- apply form islands:
  - `apps/web-app/src/components/web/apply/application-form.ts`
  - `apps/web-app/src/components/web/apply/application-step-form-card.tsx`
- client-only pages:
  - `apps/web-app/src/app/showcase/page.tsx`
  - `apps/web-app/src/app/rendering-demo/client/page.tsx`

Client responsibilities:

- hooks
- browser events
- form state
- navigation helpers
- theme toggles, dropdowns, and other interactive widgets

## The Current Mental Model

Think of the web app as three layers:

1. `app/` route shells
   - mostly server-first
2. `components/web/*`
   - mixed, but should be clearer about server vs client intent
3. `app/api/*` plus `libs/api/web-server`
   - server-only web facade and session/auth logic

## What Would Make It Easier To Understand

The code already mostly behaves this way, but the folder structure can make it clearer.

Recommended direction:

```text
apps/web-app/src/
  app/
    ... route shells and route handlers
  components/web/
    server/
    client/
    shared/
  lib/
    ... small app-local utilities only
```

### Suggested Meaning

- `components/web/server`
  - server-safe composition components
  - no hooks, no browser state, no `use client`
- `components/web/client`
  - explicit client islands
  - dropdowns, forms, launch pages, theme controls
- `components/web/shared`
  - presentational pieces safe to use from either side

## What Not To Do

Avoid:

- making everything client-side just because it is easier at first
- putting auth/session logic into client components
- mixing browser storage concerns into route shells
- hiding server-only behavior in app-local helpers with vague names

## A Good Example From This Repo

Good current pattern:

- `apps/web-app/src/app/page.tsx`
  - server-rendered landing page shell
- `apps/web-app/src/components/web/start-application-button.tsx`
  - client-only interactive entry button

Good apply-flow pattern:

- `apps/web-app/src/app/apply/[step]/page.tsx`
  - server route shell and auth boundary
- `apps/web-app/src/components/web/apply/application-form.ts`
  - client form island

Good auth pattern:

- `apps/web-app/src/app/account/sign-in/page.tsx`
  - server route entry
- `apps/web-app/src/components/web/customer-auth-launch-page.tsx`
  - client launch behavior

## Recommended Next Refactor

If we want to make the split easier to read in code, the next clean step is not a behavior rewrite. It is a file-organization pass:

1. create `components/web/client`, `components/web/server`, and `components/web/shared`
2. move the obvious client components first
3. leave route shells in `app/`
4. keep API/session/auth logic in `app/api` and `libs/api/web-server`

That would improve readability without changing the architecture itself.
