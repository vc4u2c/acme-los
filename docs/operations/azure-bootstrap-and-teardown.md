# Azure Bootstrap And Teardown

This doc is the practical command path for the current Azure scaffold.

Related docs:

- [Azure platform plan](./azure-platform-plan.md)
- [Azure governance and lifecycle](./azure-governance-and-lifecycle.md)
- [Azure monitoring and workbooks](./azure-monitoring-and-workbooks.md)
- [Okta SMS MFA with ACS](./okta-sms-mfa-with-acs.md)
- [GitHub and Azure environments](./github-azure-environments.md)
- [Azure infrastructure scaffold](../../infra/azure/README.md)

## Prerequisites

- Azure CLI authenticated
- GitHub CLI authenticated
- repository checked out locally
- PowerShell available

Optional later:

- additional subscriptions created and placed into the landing-zone hierarchy

## Set The Cost Guardrail First

Create or update the monthly subscription budget before you bootstrap anything
else:

```powershell
npm run azure:budget
```

Current default behavior:

- applies the configured monthly budgets across the target subscriptions
- current split:
  - `platform` `$10`
  - `nonprod-online` `$20`
  - `prod-online` `$15`
  - `sandbox` `$5`
- emails the signed-in user when possible
- sends notifications at `50%`, `80%`, `100%`, and `100% forecast`

Budget defaults live in:

- [governance.json](../../infra/azure/config/governance.json)

## Bootstrap Tenant Governance

Show the tenant-governance plan first:

```powershell
npm run azure:show-governance
```

Apply the management-group hierarchy and move the current subscription into the
target workload group:

```powershell
npm run azure:bootstrap:governance
```

Current governance bootstrap scope:

- ensure the target management-group hierarchy exists
- place subscriptions under the target management groups
- keep the management-group hierarchy and subscription layout aligned to the
  target landing-zone model

## Deploy The Platform Network Foundation

Deploy the persistent platform network layer before the first workload:

```powershell
npm run azure:deploy:platform-network
```

Current platform network scope:

- `rg-acme-hub-network-cus-01`
- shared private DNS zones for:
  - `privatelink.vaultcore.azure.net`
  - `privatelink.redis.azure.net`

These are persistent platform resources. Workload environments should attach to
them, not recreate them.

## Bootstrap The GitHub And Azure Automation Contract

Show the resolved plan first:

```powershell
npm run azure:show-plan
```

Bootstrap or refresh the GitHub environment contract:

```powershell
npm run azure:bootstrap
```

Refresh variables and environment metadata without recreating identities:

```powershell
npm run azure:sync-environments
```

Current bootstrap scope:

- GitHub environments
- repo variables
- environment variables
- Entra app registrations / service principals for deployment
- GitHub OIDC federated credentials
- scoped platform-network access for deployment identities so they can manage
  environment-specific private DNS links
- Microsoft Graph app permissions for deployment identities when an environment
  has `bffRuntime.serviceAuth.mode` set to `entra`

Current bootstrap non-scope:

- management groups
- subscriptions
- shared hub resources
- application runtime secrets

## Deploy The First Web Environment

Deploy `dev`:

```powershell
npm run azure:deploy:platform-network
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev
```

Deploy `qa`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName qa
```

The deploy script is idempotent:

- it creates or updates a subscription-scope deployment stack for the workload resource group
- then creates or updates a resource-group-scope deployment stack for the web infrastructure
- then creates or updates the ACA runtime deployment for the container app revision
- then creates or updates the environment monitoring stack in the platform monitor RG:
  - workbook
  - action group
  - log alerts
- then syncs the workbook definition so the live workbook content stays aligned to the repo template
- it skips the ACR rebuild if the requested image tag already exists

If you need to force a new container image after runtime or Docker changes, pass
an explicit tag:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -ImageTag aca-fix-20260407-telemetry
```

Azure deploys use the Redis-backed state path by default. Use the file-backed
override only for targeted debugging when you are not validating multi-replica
session behavior:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -StateStoreMode file
```

When the BFF is deployed, the script passes BFF version, trusted proxy secret,
BFF replica settings, and optional `bffRuntime.serviceAuth` settings into the
runtime stack. When service auth is set to `entra`, the script first deploys
the Microsoft Graph Bicep entrypoint that owns the BFF API app registration,
enterprise application, and web managed-identity app role assignment. By
default the BFF min/max replica settings follow the environment runtime settings
in `infra/azure/config/platform.json`; add an environment `bffRuntime` block
only when the BFF needs a different scale profile from the public web app or
when enabling BFF-specific hardening such as Entra service auth.

Before the first deployment of an environment with BFF Entra service auth,
refresh the automation bootstrap:

```powershell
npm run azure:bootstrap
```

For each opted-in environment, the bootstrap script grants the environment
deployment identity these Microsoft Graph application permissions:

- `Application.ReadWrite.All`
- `AppRoleAssignment.ReadWrite.All`

Those permissions are required by the source-controlled Graph Bicep template,
not by the application runtime. The bootstrap caller must be authorized to grant
tenant-wide Microsoft Graph application permissions; otherwise the script fails
early and the CD identity will not be partially configured.

## Pause And Resume A Non-Production Workload

Show the current workload state and the alert resources the script would manage:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action show-plan
```

Pause `dev`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action pause
```

Resume `dev`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/set-web-environment-state.ps1 -EnvironmentName dev -Action resume
```

Pause and resume behavior:

- for ACME LOS dev, "pause Azure" means full hibernation by default: stop both
  apps, disable alerts, and remove the two workload private endpoints
- "unpause Azure" or "resume Azure" means recreate the endpoints through Bicep,
  verify DNS, start both apps, and check readiness and health before restoring alerts
- use `-Action pause-apps` only when explicitly requesting an apps-only pause;
  other environments retain their existing apps-only pause behavior
- uses the official ACA ARM `stop` and `start` actions for the public web
  container app and the internal BFF container app when it exists
- optionally disables scheduled-query alerts before pause and re-enables them after resume
- waits for `Stopped` or `Running` by default so the command behaves predictably in automation
- blocks `prod` pause unless `-AllowProductionPause` is passed explicitly

### Hibernate Dev Private Endpoints

Dev pause uses the hibernation path. The explicit `hibernate` action remains
available as an equivalent command:

```powershell
npm run azure:pause:web -- -EnvironmentName dev
npm run azure:show-state -- -EnvironmentName dev
npm run azure:resume:web -- -EnvironmentName dev
```

Hibernation validates the recovery deployment for both private endpoints, marks
the workload resource group `acme:hibernated=true`, suppresses all four alerts,
and verifies both apps are stopped before deleting only the Key Vault and Redis
private endpoints. Azure also removes their associated NICs and managed DNS
records. The shared DNS zones and VNet links, underlying services, identities,
secrets, and Redis data are retained. Redis data TTLs continue to run while idle.
Public access is never enabled.

Live dev validation on September 10, 2026 confirmed deletion of both endpoints
and their NICs while retaining the other workload resources. Bicep restoration
recreated approved endpoints with matching private DNS records, preserved all
four endpoint/zone-group entries in the original stack, passed ACA replica
readiness and web + BFF `/api/health`, and re-enabled all four alerts. The
application build remained `2519e1dd`; no app deployment was needed.

Dev resume reconstructs missing endpoints using the existing
`modules/network/private-endpoint.bicep` module in incremental mode. It validates
the original stack ownership, service targets, subnet, and shared DNS VNet links;
waits for approved endpoints with actual DNS A records matching the new NIC IPs;
then starts the apps and checks replica readiness and public `/api/health` before
enabling alerts and clearing the marker. No local backup or secret export is
needed. Resume takes longer than restarting apps alone.

The original infrastructure stack continues to own the endpoint and explicit
DNS-zone-group resource IDs. The lifecycle script never changes its resource
list or deploys the complete infrastructure stack. Missing endpoints while
hibernated are intentional, temporary drift, visible in `azure:show-state`.
Unexpected ownership, deny settings, or unsupported endpoint customization fail
closed rather than being bypassed.

Do not run lifecycle and deployment commands concurrently. Hibernation refuses
an in-progress workload ARM deployment, and the normal deployment script refuses
a hibernated environment until explicit resume succeeds. Keep automatic CD
disabled during idle periods; older checked-out deployment scripts do not know
about this guard. The marker is a deployment interlock, not a distributed lock.

Both actions are retryable after interruption, including when only one endpoint
was deleted or restored. Failed recovery leaves the marker set; endpoint recovery
must finish before apps start, and failed app health leaves alerts suppressed.
Use `show-plan`, inspect the failure, and retry `resume` or `hibernate`. Never
delete Redis or Key Vault to resolve a connectivity failure.

At the USD retail rate of $0.01 per endpoint-hour, removing both endpoints for
730 hours saves about $14.60; savings depend on absent hours and billing terms.
Other retained services still incur charges. See [Private Link pricing](https://azure.microsoft.com/en-us/pricing/details/private-link/)
and [private DNS zone groups](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns-integration#private-dns-zone-group).

Run the offline lifecycle safety tests locally or in CI:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/tests/environment-lifecycle.tests.ps1
```

Important cost note:

- pause and resume affect the ACA web app, the internal BFF app when present,
  and the environment-specific alerts
- dev pause/hibernation additionally removes the two private endpoints;
  explicit `pause-apps` leaves them allocated
- they do not deallocate:
  - Azure Managed Redis
  - Key Vault
  - ACR
  - the ACA environment
  - platform monitoring resources
- if you want the lowest non-production cost, use teardown instead of pause

Current infrastructure scope:

- platform DNS link stack in `rg-acme-hub-network-cus-01`
- platform monitoring stack in `rg-acme-hub-monitor-cus-01`
  - `Log Analytics`
  - `Application Insights`
  - workbook
  - action group
  - log alerts
- resource group
- shared images resource group per subscription role
- workload spoke VNet
- app subnet for the ACA environment
- data subnet for private endpoints
- Azure Container Registry
- Azure Container Apps environment
- container app
- user-assigned managed identity
- Key Vault
- Azure Managed Redis
- Azure Communication Services with local key authentication disabled
- Key Vault private endpoint
- Key Vault private-endpoint NIC
- Azure Managed Redis private endpoint
- Azure Managed Redis private-endpoint NIC

Current runtime secret wiring:

- the container app reads the web session secret through a Key Vault secret reference
- the container app uses managed identity for Key Vault access, ACR pulls,
  Redis token acquisition, and optional ACS SMS delivery
- Azure Redis access-key authentication is disabled; no Azure Redis URL secret is created
- the container app stays public for now so the workload can be validated before
  Front Door is introduced

Current proven state:

- the `dev` environment is deployed in `sub-acme-nonprod-online`
- the web workload is running in `Azure Container Apps`
- `Key Vault` and `Azure Managed Redis` are private-only
- Redis managed-identity auth is proven live in `dev` as of April 19, 2026
- the ACA ingress is public for now
- the public endpoint is discovered from the current ACA deployment output
- use `/api/health` on that resolved base URL for public web + BFF smoke checks
- ACA probes use `/api/health/live`, which stays local to the Next web
  container
- the internal BFF FQDN is not a workstation/browser endpoint; use the public
  Next facade for manual checks unless you are inside the ACA environment or a
  private-network diagnostic context

Branded web-hostname activation uses staged Bicep deployments because managed
certificate issuance requires public DNS and a registered app hostname. The
helper reads current Azure verification values; never retain a generated ACA
hostname as an assumed constant across environment recreation:

```powershell
npm run azure:custom-domain:web -- -EnvironmentName dev -Action show-plan
# Add the returned CNAME and TXT values at the authoritative DNS provider.
npm run azure:custom-domain:web -- -EnvironmentName dev -Action verify-dns
```

For an existing healthy dev deployment, set
`environments.dev.publicDomain.enabled` to `true` and use the focused activation
script while Okta redirect URIs still use the current ACA hostname:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/activate-web-custom-domain.ps1 -Action show-plan -SubscriptionId 7df9ce70-48a3-4495-9361-4ca7b2637748 -PlatformSubscriptionId b582269b-60ff-4bb0-b30b-6fb2796edf11
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/activate-web-custom-domain.ps1 -Action apply -ConfirmHostname apply-dev.los.avanai.net -SubscriptionId 7df9ce70-48a3-4495-9361-4ca7b2637748 -PlatformSubscriptionId b582269b-60ff-4bb0-b30b-6fb2796edf11
```

This synchronizes the two DNS records, registers the hostname with the supported
Azure CLI command, deploys the Bicep-managed certificate, waits for issuance,
and binds it. It verifies that app images, runtime configuration, secret
references, and identities remain unchanged. It does not deploy infrastructure
stacks or write Key Vault secrets. Do not run lifecycle or deployment operations
concurrently. New environments still use the full staged deployment path below.

After `https://apply-dev.los.avanai.net/api/health` succeeds, change the Okta `dev`
deployed base URL to `https://apply-dev.los.avanai.net`, run `okta:bootstrap`,
verify its redirect, trusted-origin, and telephony-hook configuration, then run:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/activate-web-custom-domain.ps1 -Action sync-auth-origin -ConfirmHostname apply-dev.los.avanai.net -SubscriptionId 7df9ce70-48a3-4495-9361-4ca7b2637748 -PlatformSubscriptionId b582269b-60ff-4bb0-b30b-6fb2796edf11
```

The origin step changes only the two public Okta callback environment variables
on each existing app, checks preservation of the remaining runtime state, and
waits for replica readiness before proceeding to the next app.
It does not rotate secrets or rebuild images. Run it only after the Okta
configuration has been applied and verified. This enables light/dark preference
continuity with `auth.avanai.net` through a non-sensitive parent-domain cookie;
auth/session cookies remain host-scoped.

### Automated Stable-Hostname Recovery

The source-supported target is `apply-dev.los.avanai.net`. Keep the domain
registered at Namecheap and delegate only `los.avanai.net` to Azure DNS. This
requires no Namecheap API access, API key, or static-IP runner. Do not change
the root domain's nameservers, mail records, or `auth.avanai.net`.

Dev's `publicDomain.enabled` is now `true` for the approved first activation.
Adding a DNS zone does not start apps or enable CD. Long-break resource retirement
and an end-to-end DNS/HTTPS rebuild are not yet live-proven.

#### Retained Zone Bootstrap

`main.public-dns.sub.bicep` creates a dedicated platform resource group,
`rg-acme-los-dns-cus-01`, and a public child zone protected by a
`CanNotDelete` lock. These resources are outside all workload deployment stacks,
pause operations, and environment teardown. Retain the actual zone: recreating
it can change its assigned nameservers and require another manual delegation.
The DNS zone uses alphanumeric tag names (`acmeApplication`, `acmeLifecycle`,
and matching metadata); its resource group retains the shared colon-prefixed
convention. Post-deployment verification requires the expected ownership tags;
missing ownership never authorizes adopting an unrelated zone.

The administrator-run bootstrap grants the existing `gha-acme-los-dev` service
principal `DNS Zone Contributor` only on this child zone. It does not grant
access to the root domain, other platform zones, or subscription-wide resources.
This role can edit all records in the child zone; only dev uses it currently.
Review record-level permissions before sharing this zone with other environments.

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/bootstrap-public-dns.ps1 -Action show-plan
# Use the existing dev service principal OBJECT ID, not the OAuth client ID.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/bootstrap-public-dns.ps1 -Action apply -DeploymentPrincipalId <dev-service-principal-object-id> -ConfirmDnsZone los.avanai.net
```

The script validates platform subscription and identity, refuses unrelated
existing resources or delegation, and returns four actual Azure nameservers.
In Namecheap, open **Domain List > Manage avanai.net > Advanced DNS > Host Records**.
Add four **NS Record** entries, each with **Host: los**, one returned nameserver
as **Value**, and **TTL: Automatic**. Save all changes. Do not change the parent
domain's Nameservers setting or enter `@` as the host.

Observed September 15, 2026: the retained zone, deletion lock, and zone-scoped
dev permission are deployed. The DNS plan confirms exactly two pending app
records; neither had been written then. On October 1, 2026, Namecheap delegation
was verified through both Cloudflare and Google, both apps were resumed with
private connectivity and healthy build `2519e1dd`, and the app CNAME/TXT were
published and publicly verified. Managed HTTPS and Okta origin activation then
completed using the focused operation above. The stable URL is now
`https://apply-dev.los.avanai.net`. Web revision `0000091` and BFF revision
`0000062` retain the original images; no Key Vault secrets were rotated.
Automatic CD remains disabled. Apps are running and normal runtime charges
have resumed.

Desktop and mobile browser checks verified `/api/auth/idx/start`, Okta
`/v1/interact`, and `/idp/idx/introspect` return 200 with the stable callback,
and auth transaction/CSRF cookies are Secure, HttpOnly, and host-scoped.
Full password/OTP sign-in, signed-in logout, funding, and account changes still
require a user-assisted live test. This is not a completed teardown/rebuild test.

The currently assigned nameservers for the **los** NS records are:

- `ns1-06.azure-dns.com`
- `ns2-06.azure-dns.net`
- `ns3-06.azure-dns.org`
- `ns4-06.azure-dns.info`

Read the bootstrap output again if the zone is ever deliberately replaced;
these values are not portable to a newly created zone.

As verified September 15, 2026, public DNS retail pricing is $0.50 per zone/month
for the first 25 zones plus $0.40 per million queries for the first billion.
One zone and one million queries is approximately $0.90/month before tax,
separate from retained application services. No Private Resolver or paid edge
service is provisioned. See [Azure DNS pricing](https://azure.microsoft.com/en-us/pricing/details/dns/)
and [Microsoft's retail price feed](https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Azure%20DNS%27&currencyCode=%27USD%27).

#### Record Updates And HTTPS

After delegation propagates, these commands plan or update only the app CNAME
and ownership TXT in Azure. `plan-dns` is read-only; `sync-dns` requires exact
zone confirmation and verifies all four delegated nameservers before writing.

```powershell
npm run azure:custom-domain:web -- -EnvironmentName dev -Action plan-dns
npm run azure:custom-domain:web -- -EnvironmentName dev -Action sync-dns -ConfirmDnsZone los.avanai.net -DnsAttempts 30
```

The updater uses Azure CLI's authenticated identity and the Azure DNS record-set
API. New records use `If-None-Match: *`; updates require the observed ETag in
`If-Match`. Only source-owned app records can be replaced, and existing TTL and
metadata are retained. Both records are checked before either write. Conditional
failures stop without blind retries or rollback. The two PUTs are not atomic;
an explicit rerun observes current state and finishes only the remaining changes.
There is no whole-zone replacement and no Namecheap API code or credentials.

Once the hostname is enabled, opt in to DNS updates during deployment:

```powershell
# Resume hibernation first using the normal lifecycle command.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/deploy-web-environment.ps1 -EnvironmentName dev -SyncPublicDns -ConfirmDnsZone los.avanai.net
```

The deployment sequence is:

1. Validate DNS configuration, retained zone, and delegation before provisioning.
   Hibernation continues to block normal deployment.
2. Deploy the environment and app; read the actual generated hostname and
   subscription verification ID.
3. Conditionally update the CNAME and verification TXT, then verify public DNS.
4. Register the hostname with a `Disabled` certificate binding, issue the managed
   certificate through `main.web.certificate.rg.bicep`, then bind it with the
   full runtime template using `SniEnabled`.
5. Require valid HTTPS and matching web/BFF build identities at `/api/health`.
   Live sign-in, funding, and account-security tests are still required.

Already-bound hostnames are never deliberately downgraded during redeployment.
Unrelated domain or certificate bindings block the operation. The runtime
template's `none`, `register`, and `bind` phases are orchestration controls, not
standalone partial-PATCH templates. Use the deployment script so full settings,
Key Vault references, identities, and ingress are retained at every phase.

For GitHub deployment, set protected dev environment variables
`AZURE_SYNC_PUBLIC_DNS=true` and `AZURE_PUBLIC_DNS_ZONE=los.avanai.net` only after
first activation is reviewed. Standard hosted runners use existing Azure OIDC;
there are no DNS-specific secrets. Do not enable CD while dev is hibernated.

Offline verification:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/tests/dns-recovery.tests.ps1
az bicep build --file infra/azure/bicep/main.public-dns.sub.bicep
az bicep build --file infra/azure/bicep/main.web.runtime.rg.bicep
az bicep build --file infra/azure/bicep/main.web.certificate.rg.bicep
```

Public verification uses Cloudflare and Google recursive DNS with bounded
timeouts; transient lookup failures never mean the zone is unused. Certificate
issuance and renewal still need a running reachable app and any applicable CAA
policy must permit DigiCert. A retained DNS zone does not keep a certificate
renewed while the app is stopped; verify HTTPS and certificate state on resume.

Before deeper retirement, prove a real record update and new-environment
certificate/rebind cycle without deleting retained dev data. The initial Okta
origin migration remains a separate reviewed bootstrap after stable-host HTTPS
works. DNS synchronization does not change Okta redirect URLs or user data.

Sources: [Namecheap NS delegation](https://www.namecheap.com/support/knowledgebase/article.aspx/579/2237/which-record-type-option-should-i-choose-for-the-information-im-about-to-enter/),
[Azure delegation](https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns),
[Azure DNS access and locks](https://learn.microsoft.com/en-us/azure/dns/dns-protect-zones-recordsets),
[conditional record updates](https://learn.microsoft.com/en-us/rest/api/dns/record-sets/create-or-update?view=rest-dns-2018-05-01),
and [ACA managed certificates](https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-managed-certificates).

Practical smoke-check path after a deploy:

```powershell
az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query "{runningStatus:properties.runningStatus,latestReadyRevisionName:properties.latestReadyRevisionName,ingressFqdn:properties.configuration.ingress.fqdn}" `
  --output json

$ingressFqdn = az containerapp show `
  --subscription 7df9ce70-48a3-4495-9361-4ca7b2637748 `
  --resource-group rg-acme-los-web-dev-cus-01 `
  --name ca-acme-los-web-dev-cus-01 `
  --query 'properties.configuration.ingress.fqdn' `
  --output tsv

(Invoke-WebRequest -UseBasicParsing -Uri "https://$ingressFqdn/api/health" -TimeoutSec 120).Content
```

Current observability wiring:

- the container app receives an `APPLICATIONINSIGHTS_CONNECTION_STRING`
- the Node runtime starts Azure Monitor OpenTelemetry before the standalone
  Next server boots
- `Application Insights` receives traces, exceptions, and metrics
- the shared server logger also emits application log records into
  `Application Insights`
- `Log Analytics` receives container stdout/stderr and ACA platform logs
- `/api/health` and `/api/health/live` are filtered from App Insights so health
  traffic does not dominate telemetry volume
- trace sampling is rate-limited by environment:
  - `dev`, `qa`, `stg`: `2` traces per second
  - `prod`: `5` traces per second

Current monitoring deployment for each environment:

- Azure Monitor workbook
- action group
- scheduled query alerts for:
  - failed request spikes
  - exception spikes
  - auth and security failure spikes
  - ACA platform/system errors

Current follow-up note:

- the action group is deployed now
- receiver routing still needs to be added deliberately
- until then, alerts are visible in Azure Monitor but are not yet a paging path

## Tear Down A Non-Production Environment

The teardown command is a permanent environment destruction operation, not the
reversible pause/resume path. It removes Redis business data and workload
resources. Keep using hibernation until a long-break rebuild has been proven.
It does not delete the shared container registry or the shared DNS zones.
After dev ownership migration, this command explicitly refuses to delete the
retained foundation. Use recoverable dev retirement below; permanent removal
of retained secrets and identities requires a separately reviewed operation.

Show the target environment without deleting anything (the default):

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName dev -Action show-plan
```

Only after explicitly accepting data loss, destroy `dev`:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName dev -Action destroy -ConfirmResourceGroup rg-acme-los-web-dev-cus-01 -WaitForDeletion
```

Teardown behavior:

- delete the platform DNS link stack for the environment
- delete the platform monitoring stack for the environment
- delete the resource-group-scope deployment stack
- delete the subscription-scope deployment stack
- wait for each stack deletion to finish; retain resource groups and unmanaged
  resources through `deleteResources`, reporting whether the workload RG remains
- use `-WaitForDeletion` to extend polling for a soft-deleted vault only when
  an explicitly confirmed purge is requested; never wait for a retained RG
- leave the deleted Key Vault recoverable for its configured soft-delete period
- stop on Azure CLI failures rather than proceeding to other stack deletions
- purge Key Vault only when both `-PurgeDeletedKeyVault` and an exact
  `-ConfirmKeyVaultPurge <vault-name>` are explicitly supplied; never use purge
  for a reversible cost-saving operation

This keeps non-production cost under control while preserving the governance
structure. Soft deletion is not permanent secret retention: a long-break mode
must keep Key Vault live and outside the deletion set.

Production teardown exists but is intentionally guarded:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File tools/scripts/azure/teardown-web-environment.ps1 -EnvironmentName prod -Action destroy -ConfirmResourceGroup rg-acme-los-web-prod-cus-01 -WaitForDeletion -AllowProductionTeardown
```

That path should only be used deliberately and never as part of normal
operations.

The GitHub `Teardown Web Environment` workflow requires the exact workload
resource-group name for every environment, plus `DELETE_PROD` for production.
It never requests Key Vault purge. Environment approval gates still apply.

This is stack-scoped deletion, not a guarantee that the environment RG is empty
or all charges have stopped. See Microsoft's
[deletion modes](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deployment-stacks#control-detachment-and-deletion).

### Recoverable Dev Retirement

`set-dev-retirement-state.ps1` is the separate, dev-only long-break command.
Do not use permanent `destroy` for this operation. The first live retirement /
rebuild cycle is under verification; it is not yet the default for ordinary pause.

```powershell
$dev = @{
  SubscriptionId = '7df9ce70-48a3-4495-9361-4ca7b2637748'
  PlatformSubscriptionId = 'b582269b-60ff-4bb0-b30b-6fb2796edf11'
}
$confirmed = @{ ConfirmResourceGroup = 'rg-acme-los-web-dev-cus-01' }
& tools/scripts/azure/set-dev-retirement-state.ps1 @dev -Action show-plan
& tools/scripts/azure/set-dev-retirement-state.ps1 @dev @confirmed -Action prepare
& tools/scripts/azure/set-dev-retirement-state.ps1 @dev @confirmed -Action retire -DiscardDemoData
& tools/scripts/azure/set-dev-retirement-state.ps1 @dev @confirmed -Action rebuild
```

Preparation changes ownership, not resource IDs. It validates the Bicep phases,
updates `stk-acme-los-web-app-dev-cus-01` to the retained phase with `detachAll`,
and adopts only the approved disposable IDs in
`stk-acme-los-web-disposable-dev-cus-01`. Both stacks use the same source template;
the `all` phase remains the default for other environments. Unknown IDs and
unexpected subscriptions, parameters, or deny settings fail closed.

Retirement suppresses the four dev alerts, conditionally clears only the owned
app CNAME target, deletes the two apps, private endpoints, Redis, then the
remaining disposable stack, and checks that Azure
has released the ACA-managed networking. It never independently deletes the
managed load balancer or public IP. The zone, delegation, verification TXT,
Key Vault, identities, ACS phone, registry, shared monitoring, and free workload
VNet/NSGs remain. The public URL is intentionally unavailable while retired.
The empty CNAME record set retains its metadata, TTL, and zone deletion lock;
Azure does not publish empty record sets. Rebuild fills that same owned record
set using an ETag-guarded update. See Microsoft's
[DNS lock and empty-record behavior](https://learn.microsoft.com/en-us/azure/dns/dns-protect-zones-recordsets).
Endpoint and Redis parent deletions are sequenced explicitly: the live cycle
exposed conflicting parent/child deletes when the stack tried to remove them
concurrently. Each parent must be absent before stack cleanup continues.

Recovery metadata contains only public image tags, immutable digests, version,
and a hash of retained identity / secret-version metadata in workload RG tags.
There is no secret-value export, local backup dependency, or session restore.
Recovery refuses missing or changed image manifests and missing retained
secrets. It recreates private Redis with an empty dataset, restores endpoints
and managed-identity access, then deploys the existing images by digest and
reissues TLS after updating the app CNAME and verification TXT from actual ACA
outputs. Okta callbacks stay on `https://apply-dev.los.avanai.net`.

Ordinary deployment is blocked while `acme:retirement` is `preparing`,
`retiring`, `retired`, or `rebuilding`. Failed operations retain their marker.
Do not run lifecycle and deployment operations concurrently; these tags are
interlocks, not distributed locks. Keep automatic CD disabled during this cycle.
Normal deployment creates shared runtime secrets only when confirmed absent;
rebuild never creates or rotates secrets. Monitoring bootstrap now preserves an
existing monitoring stack instead of dropping its operations pack.

After rebuild, verify real password/OTP sign-in, signed-in logout, funding with
one email or phone OTP, and account-security changes. Infrastructure health is
not proof of these journeys. Repeat `retire -DiscardDemoData` only after the
intended verification cycle, or explicitly to return a failed demo to idle.

### Long-Break Acceptance Gates

Long-break runtime retirement/recreation is not yet enabled or live-proven.
The owner approved discarding dev demo data on September 15, 2026, including
Redis-backed application drafts, customer profiles, and authentication state.
Redis retention is no longer a prerequisite for the planned dev rebuild mode.
This approval does not replace the recovery checks below.
The `los.avanai.net` delegation, stable-host HTTPS, and Okta origin activation
were verified October 1, 2026. The remaining gates include the first live
retirement/rebuild cycle and full signed-in journeys. A generated ACA hostname
must not be assumed reusable after environment recreation.

Before deleting the ACA environment:

1. Establish the stable hostname with delegated Azure DNS, Bicep-managed HTTPS, and
   matching Okta redirect/logout origins. Use `azure:custom-domain:web` to obtain
   the current CNAME and verification TXT records; update only those records.
2. Verify the deployed image versions remain available in the retained registry.
3. Separate retained resources from disposable resources in the source-owned
   deployment stacks. Keep Key Vault, user-assigned identity, ACS phone-number
   ownership, shared DNS, and the image registry outside the deletion set. Dev
   Redis is disposable under the approved policy below. Do not delete managed
   load-balancer resources independently of their owning ACA environment.
4. Prove the source-owned rebuild, private connectivity, HTTPS, sign-in,
   funding, and account-security journeys before adopting deeper retirement
   as a pause default. A successful health response alone is not this proof.

#### Approved Dev Demo Data Policy

- Scope: ACME LOS `dev` only. Do not apply this decision to `qa`, `stg`, `prod`,
  another solution, or future real customer data.
- The explicit long-break mode may delete the dev Redis instance and its private
  endpoint, then recreate an empty instance through Bicep. No demo-data archive
  or restore is required; previous drafts and app profiles are intentionally lost.
- Authentication sessions, transactions, OTPs, and one-use step-up grants must
  not be restored. Require fresh sign-in and verify that existing Okta users can
  start new applications without stale customer or lead state.
- Preserve the Okta directory and app registrations, Key Vault secrets,
  deployment/runtime identities, ACS phone-number ownership, image registry,
  DNS zone, and delegation. Approval to discard Redis data is not approval to
  delete those resources or purge Key Vault.
- Recreate Redis with the existing private networking and managed-identity
  authorization, then verify readiness before starting app traffic. A disposable
  demo dataset does not relax authentication, authorization, or secret handling.
- The current `pause`/`resume` commands still retain Redis and remove/recreate
  only the two workload private endpoints. Do not use permanent `destroy` as a
  substitute for the separate secret-preserving retirement command.

The existing eight-hour draft and thirty-day profile TTLs remain unchanged
while Redis is allocated. A future requirement to preserve business data needs
a separate durable-storage and restore design; this demo reset approval must
not silently carry over to that requirement.

Azure DNS remains allocated in the platform subscription during workload
retirement. Keep the one-time Namecheap child-zone delegation intact.

Reference: [ACA recreation](https://learn.microsoft.com/en-us/azure/container-apps/relocate-region).

## Cost Discipline

For a pay-as-you-go subscription, the intended daily rhythm is:

1. keep the subscription budget in place
2. keep governance and identity structure persistent
3. deploy workload resources only when needed
4. validate the environment
5. tear down non-production workloads quickly

Do not tear down:

- subscription budgets
- management groups
- subscriptions
- GitHub environments
- deployment identities
