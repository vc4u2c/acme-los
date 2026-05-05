# BFF Implementation Checklist

This doc turns the BFF rollout plan into a concrete first-pass implementation
checklist.

Related docs:

- [bff-rollout-plan.md](./bff-rollout-plan.md)
- [current-platform.md](./current-platform.md)
- [auth-and-api-contracts.md](./auth-and-api-contracts.md)

## Current Assumption

The repo direction is still:

- BFF first
- no repo relayout first
- keep the current browser-facing `/api/*` contract stable during the first
  rollout

## Practical SDK Note

As of April 23, 2026, this local environment has `.NET SDK 9.0.101` installed.

That means the first scaffold should:

- be usable on `net9.0` immediately
- keep the code shape compatible with a later move to `net10.0`
- include an explicit follow-up task to retarget once the repo/tooling image has
  `.NET 10` available

Do not block the structural scaffold on the SDK upgrade.

## First-Pass Scope

The first pass should prove six things:

1. the repo can host a `.NET` app under `apps/*`
2. `Nx` can discover and run the app through `@nx/dotnet`
3. the app can build, test, publish, and run locally
4. the app has the minimum operational surface:
   - health
   - structured logging
   - OpenTelemetry wiring
   - API docs
5. the app has the initial LOS feature folders
6. the app can become the future home for customer and application persistence

## Proposed Root And Projects

```text
apps/
  bff-api/
    Acme.Los.Bff.sln
    Acme.Los.Bff.Api/
    Acme.Los.Bff.Api.Tests/
```

## Initial Feature Folders

The API project should start with these folders:

```text
Acme.Los.Bff.Api/
  Features/
    Auth/
    Session/
    Customer/
    Application/
    Observability/
  Infrastructure/
    OpenTelemetry/
    Logging/
    Redis/
    Okta/
  Common/
```

This is intentionally more structure than behavior. The first scaffold should
show where code goes before it tries to solve all business logic.

## Initial BFF Endpoints

These are the initial routes the scaffold should expose or reserve.

### Operational

- `GET /health`
- `GET /ready`
- `GET /openapi/v1.json`
- `GET /scalar`

### Auth And Session

- `GET /bff/auth/login`
- `GET /bff/auth/callback`
- `POST /bff/auth/logout`
- `GET /bff/auth/session`

### Customer

- `GET /bff/customer/profile`
- `PUT /bff/customer/profile`

### Application

- `GET /bff/application/steps/{step}`
- `PUT /bff/application/steps/{step}`
- `POST /bff/application/submit`

### Observability

- `POST /bff/observability/events`

The first scaffold does not need all of these fully implemented. It should at
least reserve the endpoint shape and make the operational routes real.

## Expected Nx Task Surface

After `@nx/dotnet` is added and the scaffold exists, the BFF projects should
participate in the workspace through these targets:

### API Project

- `restore`
- `build`
- `run`
- `publish`
- `clean`

### Test Project

- `restore`
- `build`
- `test`
- `clean`

## Expected Nx Commands

Once the scaffold is in place, these are the main commands we should be able to
run:

```powershell
nx show projects
nx build <bff-api-project-name>
nx test <bff-api-test-project-name>
nx run <bff-api-project-name>:run
nx run <bff-api-project-name>:publish
```

If the inferred project names are awkward, normalize them in repo docs once the
scaffold is present.

## Step-By-Step Checklist

### Step 0: Workspace Enablement

- [ ] add `@nx/dotnet`
- [ ] confirm `nx.json` plugin wiring
- [ ] confirm the repo still resolves existing Nx plugins cleanly

### Step 1: Create The .NET Projects

- [ ] create the solution file
- [ ] create the API project
- [ ] create the test project
- [ ] add the test-project reference to the API project

### Step 2: Make The App Operationally Useful

- [ ] add `GET /health`
- [ ] add `GET /ready`
- [ ] enable OpenAPI generation
- [ ] add Scalar UI
- [ ] wire basic structured logging
- [ ] wire baseline OpenTelemetry registration

### Step 3: Add LOS Slice Structure

- [ ] add the `Features/*` folders
- [ ] add the `Infrastructure/*` folders
- [ ] add placeholder endpoints or endpoint groups for auth, session, customer,
      application, and observability

### Step 4: Verify Nx Integration

- [ ] `nx build` works for the API project
- [ ] `nx test` works for the test project
- [ ] `nx run ...:run` starts the API locally
- [ ] `nx run ...:publish` produces output cleanly

### Step 5: Verify Runtime Basics

- [ ] health route returns success
- [ ] readiness route returns success
- [ ] OpenAPI document renders
- [ ] Scalar UI renders
- [ ] logs appear locally in structured form

### Step 6: Record Follow-Ups

- [ ] retarget from `net9.0` to `net10.0` once SDK 10 is available
- [ ] decide whether to keep built-in logging only or add Serilog
- [ ] decide whether Wolverine is justified before introducing it
- [ ] decide when Redis-backed session integration should move from placeholder
      to real wiring

## Suggested First Verification Loop

Use this after the scaffold lands:

```powershell
npx.cmd prettier --check .
npx.cmd nx show projects
npx.cmd nx build <bff-api-project-name>
npx.cmd nx test <bff-api-test-project-name>
dotnet build apps/bff-api/Acme.Los.Bff.sln
```

Add a local run check once the app target is discoverable under Nx.

## Not In Scope For The First Scaffold

- production-ready persistence
- full Okta callback handling
- funding step-up enforcement
- database migrations
- background messaging
- microservice decomposition
- NuGet packaging
