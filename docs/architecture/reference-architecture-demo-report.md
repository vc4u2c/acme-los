# ACME LOS Reference Architecture Demo Report

ACME LOS is a production-shaped lending reference architecture. It demonstrates a modern borrower experience, app-owned Okta IDX identity journeys, a secure BFF pattern, Azure landing-zone deployment, observability, analytics, release automation, and source-owned platform configuration.

This report is both a demo guide and a capability inventory. It is intentionally broad so foundational features, including CSRF, UI grid behavior, managed identity, release notes, Okta branding, and vulnerability gates, stay visible during architecture review.

## Executive Summary

ACME LOS is organized around six reference architecture demo domains, flattened into individual items so the document can be used as a presentation agenda:

1. Engineering system, CI/CD, and quality gates.
2. Product experience, UI system, and grid/data workflows.
3. Identity, Okta, MFA, and account security.
4. BFF, API, session, and token security.
5. Azure landing zone, runtime infrastructure, and managed identity.
6. Observability, analytics, operations, and admin tooling.

The current implementation is strongest as a development and pre-production reference architecture. It already shows the right enterprise shape: source-controlled infrastructure, automated checks, app-owned Okta IDX journeys, server-side PKCE, opaque sessions, Redis-backed auth state, managed identity, Key Vault, private endpoints, Azure Container Apps, structured observability, and GA4/GTM instrumentation.

The known production-hardening backlog is also explicit: fully proven QA and higher-environment promotion, Front Door/WAF/private origin, production secret rotation runbooks, load and resilience testing, multi-region disaster recovery, and final system-of-record integration for lending data.

## Project Showcase Positioning

This document can be used as a Microsoft-facing project showcase for the multi-month body of work behind ACME LOS. The story is not only that the demo runs. The stronger story is that the repo shows repeatable enterprise engineering patterns across application code, identity, security, cloud infrastructure, CI/CD, observability, analytics, and documentation.

Use this positioning when presenting the work:

1. Start with the borrower and business problem: a secure lending application experience with account recovery, profile management, funding assurance, and operational visibility.
2. Show the engineering system: monorepo structure, automated quality gates, release records, versioning, and vulnerability management.
3. Show the product system: Next.js, React, mobile shell, shared UI primitives, layout grid, data grid, forms, and dashboard workflows.
4. Show the security system: app-owned Okta IDX identity, BFF, server-side PKCE, Redis-backed session state, CSRF, token hardening, and managed secrets.
5. Show the cloud platform: Azure landing-zone assets, Container Apps, Key Vault, Redis, private endpoints, managed identity, Bicep, and GitHub OIDC.
6. Show the operating model: App Insights, Log Analytics, workbooks, alerts, GA4/GTM, admin scripts, bootstrap tooling, docs, and known production gaps.

That framing makes the project read as architecture, implementation, automation, and operations work, not a single-page demo.

## Reference Architecture Demo 1 - Engineering system, CI/CD, and quality gates - Nx monorepo and project boundaries

- Nx workspace with application and library boundaries.
- Apps include `apps/web-app`, `apps/mobile-app`, and the .NET BFF.
- Shared code is grouped into reusable libraries for API contracts, UI, analytics, security helpers, and test utilities.
- Project tags and validation protect dependency direction.
- Nx project graph makes ownership, affected builds, and incremental verification visible.

## Reference Architecture Demo 2 - Engineering system, CI/CD, and quality gates - CI/CD and release automation

- GitHub Actions run CI on pull requests and `main`.
- Main branch CI produces versioned release and deployment artifacts.
- Dev CD deploys after successful main CI.
- Environment-specific deployment wrappers exist for dev, QA, staging, and production.
- Independent release groups support separate versioning for web, mobile, and BFF artifacts.

## Reference Architecture Demo 3 - Engineering system, CI/CD, and quality gates - Developer workflow guardrails

- Husky hooks run local quality checks before commits.
- `lint-staged` keeps fast local formatting and lint feedback focused on changed files.
- Commitlint enforces consistent commit message format.
- Prettier and ESLint provide repository-wide formatting and static analysis.
- Project tag validation catches architectural drift early.

## Reference Architecture Demo 4 - Engineering system, CI/CD, and quality gates - Vulnerability management

- npm audit is part of the Node security workflow.
- NuGet audit is part of the .NET security workflow.
- Package overrides are used intentionally for transitive vulnerability hardening.
- Dependency security work is documented as a repeatable workflow, not handled as one-off fixes.
- CI gates help keep dependency risk visible before code reaches deployment.

## Reference Architecture Demo 5 - Engineering system, CI/CD, and quality gates - Test system

- Jest covers TypeScript and React behavior.
- Playwright covers web end-to-end flows.
- Expo web E2E covers mobile-app web execution paths.
- xUnit covers .NET BFF behavior.
- Reqnroll/Gherkin acceptance tests document BFF behavior as executable scenarios.

## Reference Architecture Demo 6 - Product experience, UI system, and grid - Next.js and React web experience

- Next.js 16 App Router powers the web application.
- React 19 is used for the frontend runtime.
- Public routes support marketing, support, and application entry points.
- The borrower application flow supports a multi-step lending journey under `/apply/[step]`.
- The dashboard and account profile routes expose secure customer self-service actions.

## Reference Architecture Demo 7 - Product experience, UI system, and grid - Mobile experience

- Expo 55 and React Native provide the mobile application shell.
- NativeWind and Gluestack provide mobile styling and component primitives.
- React Navigation supports mobile routing patterns.
- Mobile release/version wiring participates in the same monorepo delivery model.
- Expo web E2E keeps mobile behavior testable in CI-friendly environments.

## Reference Architecture Demo 8 - Product experience, UI system, and grid - UI component library

- Shared web UI primitives are exported from `@acme-los/ui-web`.
- Tailwind CSS provides utility styling.
- shadcn-style component conventions and Radix primitives provide accessible interaction foundations.
- Lucide icons are used for consistent iconography.
- CVA, `clsx`, and `tailwind-merge` support variant-driven component styling without ad hoc class churn.

## Reference Architecture Demo 9 - Product experience, UI system, and grid - UI layout grid and data grid system

- The web UI includes responsive page grids, constrained content regions, dashboard layouts, and form layouts.
- The application favors dense, scannable operational UI over generic marketing cards.
- The grid/table showcase uses TanStack Table for enterprise data screens.
- Sorting, filtering, pagination, row-level interaction, editable rows, and collapsible rows are represented.
- E2E coverage helps protect important grid, table, and workflow behavior.

## Reference Architecture Demo 10 - Product experience, UI system, and grid - Client state, forms, and API integration

- TanStack Query supports client-side server-state workflows.
- TanStack Form supports structured form handling.
- Shared contracts and API helpers reduce route-by-route duplication.
- The web app respects the current server/client split for Next.js.
- The `/api/*` facade keeps browser calls aligned with the BFF boundary.

## Reference Architecture Demo 11 - Identity, Okta, MFA, and account security - App-owned IDX

- The ACME web app renders direct Okta IDX sign-in and remediation.
- IDX registration captures the customer profile fields needed for the demo.
- Email is treated as the simple customer login identifier.
- Okta-hosted pages remain a tested mobile and rollback baseline.
- Bootstrap tooling keeps Okta configuration source-owned instead of portal-only.

## Reference Architecture Demo 12 - Identity, Okta, MFA, and account security - Registration and profile enrollment

- Registration includes first name, last name, email, mobile phone, state, password, and Okta-managed password requirements.
- The state field is modeled as a customer profile attribute for the demo.
- Profile enrollment ordering keeps the registration page understandable.
- Email remains the customer login identifier to avoid username confusion.
- Profile attributes are managed through source-owned Okta bootstrap tooling.

## Reference Architecture Demo 13 - Identity, Okta, MFA, and account security - MFA and account recovery policies

- Email verification, security question, and optional phone setup are represented in the auth journey.
- Email is available for verification and account recovery.
- Security question is available where policy requires a hint-style proof.
- Phone/SMS is optional for now while provider approval and limits are resolved.
- Funding can use step-up MFA without asking for the password again.

## Reference Architecture Demo 14 - Identity, Okta, MFA, and account security - Hosted page branding and state coverage

- Sign-in, registration, enrollment, verification, recovery, and error states use ACME LOS hosted-page styling.
- Light and dark modes are represented for hosted Okta pages.
- Hosted-page audits render important states across desktop and mobile sizes.
- Templates are maintained under `tools/scripts/okta/templates`.
- The Okta bootstrap path applies branding and page template changes.

## Reference Architecture Demo 15 - Identity, Okta, MFA, and account security - Account security CTAs and policy scope

- Account security actions stay in the ACME web experience and use direct IDX step-up plus server-side Okta MyAccount calls.
- Change and recovery journeys are policy-driven where Okta supports them.
- The implementation documents which policies can be app-scoped and which are org-level Okta settings.
- Dashboard/profile CTAs avoid Okta jargon in user-facing copy.
- Known Okta org-level limits are documented instead of hidden.

## Reference Architecture Demo 16 - BFF, API, session, and token security - Next.js API facade

- Next.js exposes an `/api/*` facade for the browser.
- Browser calls stay on same-origin application routes.
- The facade delegates real Okta-backed auth/session/customer/application work
  to the BFF.
- This keeps frontend ergonomics while preserving the backend authority model.

## Reference Architecture Demo 17 - BFF, API, session, and token security - .NET BFF API surface

- The .NET BFF owns backend authority for real Okta-backed
  auth/session/customer/application behaviors.
- The BFF uses Minimal APIs, OpenAPI, Scalar docs, health, readiness, and modular endpoint organization.
- Wolverine-style handler organization supports clean feature boundaries where used.
- API contracts are shared instead of hand-recreated across clients.
- Health and readiness endpoints support platform probes and smoke checks.

## Reference Architecture Demo 18 - BFF, API, session, and token security - Server-side PKCE and Redis state

- Browser tokens are kept out of client JavaScript.
- PKCE verifier, nonce, and state are stored server-side, not in local browser storage.
- Redis backs auth transaction state so multiple BFF instances can complete Interaction Code exchanges.
- Opaque HTTP-only cookies point to server-owned session state.
- Auth transaction state is consumed and deleted after successful Interaction Code completion.

## Reference Architecture Demo 19 - BFF, API, session, and token security - Session, CSRF, and browser hardening

- Opaque HTTP-only cookies reduce token exposure in the browser.
- Server-enforced idle and absolute expiry protect long-running sessions.
- CSRF protection uses a double-submit pattern for state-changing browser requests.
- CSP headers reduce script and data exfiltration risk.
- Server logout clears local state and coordinates with Okta identity-provider logout.

## Reference Architecture Demo 20 - BFF, API, session, and token security - Token and access hardening

- Access and ID tokens are validated on the server side.
- Rate limits, audit logs, CSP, trusted proxy secrets, and service authentication protect runtime APIs.
- Funding step-up uses Okta assurance context and a short server-side freshness window.
- Optional Entra service authentication protects internal web-to-BFF calls.
- Customer ID sample writeback is guarded behind explicit demo mode.
- Okta management access is scoped through a service integration rather than a broad admin login.

## Reference Architecture Demo 21 - Azure landing zone, runtime infrastructure, and managed identity - Azure landing zone

- Azure subscription and environment setup are source-owned under `infra/azure`.
- Landing-zone scripts support governance hierarchy, workload subscriptions, platform networking, and budgets.
- Dev runs on Azure Container Apps with private infrastructure dependencies.
- Deployment identities use GitHub OIDC instead of long-lived Azure credentials.
- Higher environments are represented with wrappers and guardrails even where full promotion is still pending.

## Reference Architecture Demo 22 - Azure landing zone, runtime infrastructure, and managed identity - Azure runtime architecture

- Public web traffic lands on the Next.js Container App.
- The BFF runs as an internal Container App.
- Redis stores auth/session and application state behind private networking.
- Key Vault stores runtime secrets behind private networking.
- Managed identity is used for Azure resource access where supported.
- Azure Communication Services is staged for SMS once number/provider approval is complete.

## Reference Architecture Demo 23 - Azure landing zone, runtime infrastructure, and managed identity - Managed identity and service auth

- GitHub deployment identities use OIDC instead of stored Azure credentials.
- A shared user-assigned managed identity supports ACR pull, Key Vault, Redis Entra auth, and runtime access.
- Optional Entra service authentication can protect internal BFF calls.
- Workload identities are scoped per environment.
- Runtime configuration favors Key Vault and managed identity over static secrets.

## Reference Architecture Demo 24 - Azure landing zone, runtime infrastructure, and managed identity - Network and secret hardening

- Private endpoints and private DNS protect Key Vault and Redis.
- NSGs constrain network paths.
- Key Vault references keep secrets out of app settings where possible.
- GitHub secrets are reserved for deployment-time or bootstrap values that cannot live in source.
- Custom domain and Okta custom domain support are represented in the platform plan.

## Reference Architecture Demo 25 - Azure landing zone, runtime infrastructure, and managed identity - Bicep, scripts, and environment lifecycle

- Bicep modules define runtime, monitoring, state, network, naming, and security resources.
- Environment parameter files support dev, QA, staging, and production wrappers.
- Deployment Stacks help make infrastructure ownership explicit.
- Pause/resume and teardown scripts support non-prod cost control.
- ACS number-management scripts support the SMS provider path.

## Reference Architecture Demo 26 - Observability, analytics, operations, and admin tooling - Observability and tracing

- Application Insights captures application telemetry.
- Log Analytics stores operational logs and supports Kusto queries.
- Azure Monitor alerts and workbooks provide platform visibility.
- Structured JSON logs include correlation identifiers.
- W3C `traceparent` and `X-Correlation-ID` support request tracing across web and BFF hops.

## Reference Architecture Demo 27 - Observability, analytics, operations, and admin tooling - GA4, GTM, and journey analytics

- GA4 and GTM configuration are source-owned under `infra/analytics`.
- Runtime analytics are vendor-neutral first, then mapped to GA4/GTM.
- The data layer captures route changes, auth milestones, application step views/completions, and submit outcomes.
- Consent defaults are initialized before tags run.
- Analytics avoids PII, query strings, hashes, tokens, cookies, and form payloads.

## Reference Architecture Demo 28 - Observability, analytics, operations, and admin tooling - Release, promotion, and environment operations

- GitHub environments separate dev, QA, staging, and production deployment controls.
- Dev CD is automated from successful main CI.
- Higher environment wrappers exist for controlled promotion.
- Release records and deployment artifacts make versions traceable.
- Environment setup docs clarify repo variables, environment variables, and secrets.

## Reference Architecture Demo 29 - Observability, analytics, operations, and admin tooling - Admin and bootstrap tooling

- Okta bootstrap, audit, policy plan, cleanup, and hosted-page audit scripts are source-owned.
- Azure deploy, teardown, pause/resume, custom-domain, ACS, and environment setup scripts are source-owned.
- Analytics render and admin-plan scripts create repeatable GA4/GTM setup instructions.
- REST Client files support quick API probing during demos.
- Local/dev inspectors expose security and environment state without exposing production secrets.

## Reference Architecture Demo 30 - Observability, analytics, operations, and admin tooling - Documentation and repeatable skills

- Architecture, operations, reference, Okta, Azure, analytics, and release docs are linked from the docs index.
- Repo-local skills capture repeatable workflows for security review, verification, docs, Azure, Okta, analytics, dependencies, frontend, backend, and E2E testing.
- The root README keeps a fast demo inventory for quick review.
- Enterprise readiness docs separate live capabilities from production backlog.
- This report is the top-level architecture demo script.

## Comprehensive Capability Inventory

### Workspace and engineering

- Nx 22 workspace.
- npm package management.
- TypeScript application and library structure.
- Independent release groups.
- Project graph and affected-task workflows.
- Project tag enforcement.
- Prettier formatting.
- ESLint linting.
- Husky local hooks.
- `lint-staged` staged-file validation.
- Commitlint commit message validation.
- Automated release records.
- Deployment artifacts from CI.
- Environment wrapper scripts.
- Developer REST Client probes.
- Repository-local agent skills for repeatable maintenance workflows.

### Web and mobile product

- Next.js 16 App Router.
- React 19.
- Server/client component split.
- Customer application flow.
- Customer dashboard.
- Account profile and account security CTAs.
- Public support and informational routes.
- Non-prod environment visibility.
- Expo 55 mobile shell.
- React Native 0.83.
- NativeWind mobile styling.
- Gluestack mobile components.
- React Navigation.
- Shared contracts and utilities across app surfaces.

### UI and design system

- Tailwind CSS.
- shadcn-style web component conventions.
- Radix accessible primitives.
- Lucide icons.
- Shared `@acme-los/ui-web` package.
- Button, input, checkbox, form field, radio group, select, textarea, card, dialog, sheet, alert, accordion, and progress primitives.
- CVA variant styling.
- `cn` helper with `clsx` and `tailwind-merge`.
- Responsive page grid and layout conventions.
- Dense dashboard and operational UI patterns.
- Grid/table showcase using TanStack Table.
- Sorting, filtering, pagination, editable rows, and collapsible rows.
- Responsive layout behavior.
- Light/dark theme support where implemented.
- App-owned Okta IDX styling aligned to ACME LOS.

### Identity and access

- App-owned Okta IDX sign-in.
- App-owned Okta IDX registration and recovery.
- App-owned account management with policy-bound IDX step-up.
- Okta custom branding and white labeling.
- Okta custom domain support.
- Okta customer group and app assignment automation.
- Email-as-username customer model.
- Profile enrollment fields for customer data capture.
- Email authenticator.
- Password authenticator.
- Security question authenticator.
- Optional phone/SMS authenticator.
- Funding step-up MFA.
- Adaptive sign-on policy concepts for risk and new-device prompts.
- Global session lifetime configuration.
- App-scoped access policy where Okta supports it.
- Org-level settings documented where Okta does not allow app scoping.

### BFF, API, and session security

- .NET Minimal API BFF.
- OpenAPI generation.
- Scalar API documentation.
- Health and readiness endpoints.
- Modular endpoint organization.
- Next.js `/api/*` browser facade.
- BFF-backed Next facade for real auth/session/customer/application behavior.
- Server-side PKCE.
- Server-side IDX transaction state.
- Redis-backed auth transaction storage.
- Opaque HTTP-only session cookies.
- Server-enforced idle and absolute expiry.
- Server logout.
- Token validation on the server.
- Tokens kept out of browser JavaScript.
- CSRF double-submit protection.
- Trusted proxy secret between web and BFF.
- Optional Entra service authentication for internal BFF calls.
- CSP headers.
- Rate limiting.
- Audit logging.
- Funding step-up freshness marker.
- Customer ID sample writeback guarded behind explicit demo mode.

### Data and state

- Redis-backed web auth and session state.
- Redis-backed PKCE transaction state for multi-instance correctness.
- Local file fallback for some local/dev state.
- BFF in-memory fallback for scaffold scenarios.
- Customer/application bridge state for demo flows.
- Claims for lead and customer identity.
- Okta profile attributes for demo identity data.
- Explicit backlog for system-of-record lending data integration.

### Azure Platform

- Azure Container Apps.
- Public web app container.
- Internal BFF container.
- Azure Managed Redis.
- Azure Key Vault.
- Azure Container Registry pull through managed identity.
- Private endpoints.
- Private DNS.
- NSGs.
- User-assigned managed identity.
- GitHub OIDC deployment identity.
- Platform-owned monitoring resources.
- Workload-owned runtime resources.
- Bicep modules.
- Bicep parameter files per environment.
- Deployment Stacks.
- Budget scripts.
- Pause/resume scripts.
- Teardown scripts.
- Custom-domain scripts.
- ACS SMS sender and number management scripts.

### Observability

- Application Insights.
- Log Analytics.
- Azure Monitor log alerts.
- Azure Workbooks.
- Structured application logs.
- Browser-origin observability endpoint with allowlist behavior.
- Trace propagation with `traceparent`.
- Correlation IDs with `X-Correlation-ID`.
- Diagnostics endpoints for trace demos.
- Kusto query documentation.
- Health and readiness checks for runtime operations.

### Analytics

- Source-owned GA4 and GTM manifests.
- Environment-specific analytics manifests.
- GTM and GA4 admin planning scripts.
- Runtime GTM loader.
- Direct GA4 fallback when GTM is not configured.
- App-owned page view emission.
- Route group classification.
- Consent initialization.
- Journey milestone events.
- Auth event instrumentation.
- Application step instrumentation.
- Submit success and failure instrumentation.
- No PII in analytics payloads.
- No query strings, hashes, tokens, cookies, or form payloads in analytics.

### Security Hardening Examples

- Browser token avoidance.
- HTTP-only cookies.
- Secure cookie settings by environment.
- Server-side PKCE state.
- Redis state for multi-instance correctness.
- CSRF protection.
- CSP.
- Rate limiting.
- Audit logging.
- Key Vault for secrets.
- Managed identity for Azure resource access.
- Private endpoints for sensitive platform dependencies.
- GitHub OIDC instead of stored Azure credentials.
- Scoped Okta management app for bootstrap and profile update operations.
- npm and NuGet vulnerability gates.
- Dependency override documentation.
- Non-prod-only inspectors and diagnostics.

### Documentation and tooling

- Architecture docs.
- Enterprise readiness docs.
- Tech stack docs.
- Current platform docs.
- Release and delivery docs.
- Azure environment docs.
- Azure monitoring docs.
- Okta setup and bootstrap docs.
- Analytics setup docs.
- Skills for docs maintenance, security review, verification, Azure, Okta, analytics, dependency security, frontend, backend, and testing.
- Scripts for Okta, Azure, analytics, Redis, release, audit, and agent verification.

## Current Security Posture

The solution has a strong pre-production security posture because the most important trust boundaries are already represented:

- The browser does not own tokens.
- The server owns PKCE and session state.
- Redis supports multi-instance auth correctness.
- The BFF is the authority for protected backend actions.
- CSRF is enforced on browser state-changing calls.
- Okta handles credential, recovery, MFA, and hosted registration flows.
- Azure secrets are kept in Key Vault.
- Azure runtime access uses managed identity where possible.
- Sensitive platform dependencies use private networking.
- CI includes dependency vulnerability gates.

The remaining production work should be tracked plainly:

- Put Front Door and WAF in front of public ingress.
- Lock down private origin paths behind Front Door.
- Prove QA, staging, and production promotion end to end.
- Add load, resilience, and failover testing.
- Add final secret rotation and incident response runbooks.
- Finish system-of-record data integration.
- Define DR and multi-region objectives.
- Finalize production SMS provider approval and failover behavior.

## Presentation Sequence

Use this sequence for a clean architecture walkthrough:

1. Start with the Nx monorepo, CI/CD, release records, tests, and vulnerability gates.
2. Show the borrower web experience, dashboard, UI component library, and grid system.
3. Walk through app-owned Okta IDX sign-in, registration, recovery, MFA, and account security.
4. Explain the BFF pattern: Next facade, .NET BFF, server-side PKCE, Redis, opaque sessions, CSRF, and token hardening.
5. Walk the Azure runtime: ACA, Key Vault, Redis, private endpoints, managed identity, Bicep, environment wrappers, and cost-control scripts.
6. Finish with operations: App Insights, Log Analytics, workbooks, alerts, GA4/GTM, admin bootstrap tools, docs, and the production-hardening backlog.

## What Not To Oversell

- Dev is the proven deployed environment today.
- QA, staging, and production wrappers exist, but full promotion proof is still a roadmap item.
- Okta supports some app-scoped controls, while other settings are org-level and must be documented as such.
- SMS demo behavior depends on the configured telephony provider and Okta org limits.
- Customer ID writeback is a demo bridge until a real customer system of record is integrated.
- Front Door, WAF, private origin, and DR are target production architecture items, not fully closed implementation items.
