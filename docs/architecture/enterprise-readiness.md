# Enterprise Readiness

This is a candid current-state assessment of ACME LOS across security,
scalability, fault tolerance, and enterprise readiness.

Short answer: the solution is now enterprise-shaped and credible for
pre-production. It is not yet a fully production-hardened enterprise edge
deployment because `qa` repeatability, Front Door/WAF/private origin, regional
resilience, and durable system-of-record services still need to be proven.

## Executive Assessment

| Area                 | Current posture                                                           | Reading                                                           |
| -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Security             | Strong dev/pre-prod foundation                                            | Server-side auth, BFF authority, CSRF, Key Vault, MI, Redis PE    |
| Scalability          | Good app/runtime base                                                     | Stateless web/BFF, Redis-backed state, ACA replicas, Nx release   |
| Fault tolerance      | Solid single-region baseline                                              | Health probes and multiple replicas; no multi-region failover yet |
| Enterprise readiness | Strong foundation, production hardening still staged                      | Good operating model, needs `qa` proof and edge/DR maturity       |
| Analytics            | Admin plane and web runtime are wired; IDs/container setup still external | GA4/GTM config is source-owned and page events are app-owned      |
| API testability      | Improving                                                                 | `.http`, Reqnroll, Playwright, xUnit, and health checks exist     |

## Runtime Security Shape

```mermaid
flowchart LR
  browser[Browser] --> next[Next.js public origin]
  next --> facade[/api/* facade]
  facade --> checks[Cookie, CSRF, auth, assurance checks]
  checks --> bff[Internal .NET BFF]
  bff --> state[(Redis server-side state)]
  bff --> okta[Okta]
  next --> kv[Key Vault references]
  bff --> kv
  mi[User-assigned managed identity] -. Azure resource access .-> next
  mi -. Azure resource access .-> bff
  secret[Trusted proxy secret] -. guards identity headers .-> bff
```

Security strengths:

- browsers call the same-origin Next `/api/*` facade instead of the raw BFF
- BFF mode makes the BFF the auth/session, CSRF, customer-profile, and
  application-flow authority behind that facade
- Okta hosted sign-in uses server-side PKCE, nonce/state validation, and
  server-side id-token validation
- tokens stay off the browser in the normal signed-in flow
- opaque HTTP-only sessions and CSRF double-submit protection are in place
- Redis holds shared server-side state in hardened local and Azure paths
- Key Vault and Azure Managed Redis are private-only in Azure
- the web and BFF apps use a user-assigned managed identity for ACR pull, Key
  Vault references, and Redis Entra auth
- trusted BFF identity headers are guarded by the internal ACA boundary plus
  `ACME_BFF_TRUSTED_PROXY_SECRET`
- dev-only security inspector behavior is explicitly opt-in outside local/dev

Security gaps before production hardening:

- Front Door, WAF, stable custom domains, and private-origin ACA ingress are not
  in place yet
- managed identity is not yet used as an app-level Next-to-BFF token assertion
- production-grade secret rotation and break-glass runbooks need to be written
  and rehearsed
- rate limits and abuse controls should be reviewed for every mutating API
- real GA4/GTM IDs, GTM container triggers, and GA4 key events still need to be
  created in the Google admin surfaces before production analytics is useful

## Scalability

Scalability strengths:

- web and BFF are stateless container apps from the browser point of view
- Redis centralizes session and short-lived workflow state for multi-replica
  behavior
- `dev` runs web and BFF with warm replicas, and BFF scale follows environment
  runtime scale unless explicitly overridden
- release artifacts are project-prefixed and independently versioned for web,
  mobile, and BFF API
- Nx affected graph, tags, CI checks, and release groups keep the monorepo
  scalable for engineering teams

Scalability gaps:

- `qa`, `stg`, and `prod` need the same deployment proof as `dev`
- autoscale rules should move beyond fixed non-prod replica counts before real
  load arrives
- customer/application persistence still needs a durable backend system of
  record instead of temporary server-side workflow state
- performance/load tests should be added for sign-in callback, session touch,
  application save, and BFF proxy paths

## Fault Tolerance

Fault-tolerance strengths:

- ACA startup, readiness, and liveness probes are defined for web and BFF
- health endpoints expose web and BFF layer status, versions, build IDs, and
  runtime details
- Application Insights, Log Analytics, workbook, and alert rules give operators
  a real investigation surface
- Redis and Key Vault use managed Azure services with private endpoint access
- deployment stacks and teardown/pause controls reduce drift and make non-prod
  lifecycle explicit

Fault-tolerance gaps:

- the platform is currently single-region
- there is no Front Door failover or multi-region origin strategy yet
- Redis/Key Vault backup, restore, and regional resilience posture needs a
  production design
- rollback drills and disaster-recovery exercises are not yet documented
- downstream Okta and Google dependency behavior should be included in runbooks

## Enterprise Readiness

Already enterprise-shaped:

- clear environment model: `dev`, `qa`, `stg`, `prod`
- infrastructure is represented through Bicep, scripts, and GitHub workflows
- GitHub-to-Azure deployment uses OIDC rather than long-lived deployment
  credentials
- runtime identity is separate from deployment identity
- docs cover local development, release, Azure lifecycle, monitoring, Okta,
  analytics, HTTP testing, and architecture
- `.NET` vulnerability audit path exists through `npm run dotnet:audit`
- e2e strategy now includes Reqnroll/Gherkin BFF acceptance coverage and
  Playwright browser coverage

Enterprise gaps to close next:

- prove `qa` with the same ACA, Redis, Key Vault, BFF, Okta, and monitoring
  shape as `dev`
- add Front Door/WAF/custom domain/private-origin plan and implementation
- add Azure Monitor action-group receivers and on-call notification paths
- add production data platform and migration path for customer/application data
- add load/performance checks and dependency-failure drills
- decide whether Next-to-BFF hardening should use managed-identity token
  validation, mTLS, or both
- add server-side Measurement Protocol emission for auth callbacks and other
  events the browser cannot observe

## Practical Rating

- `dev` demo and engineering platform: strong
- pre-prod architecture: credible and clean
- production security edge: planned, not done
- production resilience: planned, not done
- enterprise readiness overall: good foundation, not final certification-ready

The right next milestone is not a rewrite. It is to prove `qa`, wire real
notifications, keep CI/CD green, and then add edge and resilience layers in the
same source-controlled way the repo already uses for Okta and Azure.
