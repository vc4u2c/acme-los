import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const workflow = parse(
  readFileSync(
    join(root, '.github/workflows/deploy-web-environment.yml'),
    'utf8',
  ),
);
const steps = workflow.jobs.deploy_web.steps;
const preflight = steps.find(
  (step) => step.name === 'Validate deployment script compatibility',
);
const deploy = steps.find(
  (step) =>
    step.name === 'Provision Azure web infrastructure and deploy container app',
);
const expressions = {
  'vars.AZURE_WEB_IMAGE_REPOSITORY': '',
  'vars.AZURE_BFF_IMAGE_REPOSITORY': '',
  'vars.AZURE_BFF_DEPLOYMENT_MODE': '',
  'inputs.environment_name': 'dev',
  'vars.AZURE_TENANT_ID': '11111111-1111-1111-1111-111111111111',
  'vars.AZURE_SUBSCRIPTION_ID': '22222222-2222-2222-2222-222222222222',
  'vars.AZURE_LOCATION_PRIMARY': 'centralus',
  'steps.inspect_deploy_artifact.outputs.commit_sha': 'a'.repeat(40),
  'steps.inspect_deploy_artifact.outputs.bff_version': '0.0.23',
  'inputs.bicep_parameter_file': 'infra/azure/bicep/dev.bicepparam',
};
const deployBody = deploy.run.replace(
  /\$\{\{\s*(.*?)\s*\}\}/g,
  (_, expression) => {
    assert.ok(
      Object.hasOwn(expressions, expression),
      `Unknown expression: ${expression}`,
    );
    return expressions[expression];
  },
);

function runContract({
  omitted = [],
  sync = '',
  zone = '',
  unsetFlag = false,
}) {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'acme-los-workflow-contract-'));
  try {
    mkdirSync(join(directory, 'tools/scripts/azure'), { recursive: true });
    const runner = join(directory, 'test.ps1');
    // Use real PowerShell parameter binding with only the cloud-calling body replaced.
    writeFileSync(
      runner,
      `$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($env:CONTRACT_SOURCE, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Deployment source did not parse.' }
$omitted = @($env:CONTRACT_OMITTED -split ',')
$parameters = @($ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -notin $omitted } | ForEach-Object { $_.Extent.Text })
$fixture = "[CmdletBinding()]\nparam(" + ($parameters -join ",\n") + ")\n"
$fixture += @'
Set-Content -LiteralPath invoked.txt -Value invoked
$PSBoundParameters | ConvertTo-Json -Depth 5
'@
Set-Content -LiteralPath ./tools/scripts/azure/deploy-web-environment.ps1 -Value $fixture
${preflight.run}
${deployBody}
`,
    );
    const env = {
      ...process.env,
      ACME_SYNC_PUBLIC_DNS: sync,
      ACME_DNS_ZONE: zone,
      CONTRACT_SOURCE: join(
        root,
        'tools/scripts/azure/deploy-web-environment.ps1',
      ),
      CONTRACT_OMITTED: omitted.join(','),
    };
    if (unsetFlag) delete env.ACME_SYNC_PUBLIC_DNS;
    const result = spawnSync(
      process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        runner,
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 20000,
        env,
      },
    );
    assert.ifError(result.error);
    const output = join(directory, 'deployment-result.json');
    return {
      status: result.status,
      message: result.stdout + result.stderr,
      invoked: existsSync(join(directory, 'invoked.txt')),
      parameters: existsSync(output)
        ? JSON.parse(readFileSync(output, 'utf8').replace(/^\uFEFF/, ''))
        : null,
    };
  } finally {
    assert.equal(dirname(realpathSync(directory)), parent);
    assert.ok(basename(directory).startsWith('acme-los-workflow-contract-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('compatibility is checked against artifact source before Azure login', () => {
  assert.ok(
    steps.indexOf(preflight) >
      steps.findIndex(
        (step) => step.name === 'Checkout deploy artifact source',
      ),
  );
  assert.ok(
    steps.indexOf(preflight) <
      steps.findIndex((step) => step.name === 'Azure login'),
  );
  for (const step of [preflight, deploy]) {
    assert.equal(
      step.env.ACME_SYNC_PUBLIC_DNS,
      '${{ vars.AZURE_SYNC_PUBLIC_DNS }}',
    );
    assert.equal(step.env.ACME_DNS_ZONE, '${{ vars.AZURE_PUBLIC_DNS_ZONE }}');
  }
});

for (const sync of ['', 'false']) {
  for (const omitted of [[], ['SyncPublicDns', 'ConfirmDnsZone']]) {
    test(`DNS disabled (${sync || 'unset'}) supports ${omitted.length ? 'legacy' : 'current'} parameters`, () => {
      const result = runContract({
        sync,
        omitted,
        zone: 'unused.example.test',
      });
      assert.equal(result.status, 0, result.message);
      assert.equal(result.invoked, true);
      assert.equal(result.parameters.EnvironmentName, 'dev');
      assert.equal(result.parameters.BffVersion, '0.0.23');
      assert.equal(Object.hasOwn(result.parameters, 'SyncPublicDns'), false);
      assert.equal(Object.hasOwn(result.parameters, 'ConfirmDnsZone'), false);
    });
  }
}

test('current source receives enabled DNS and its explicit zone', () => {
  const result = runContract({ sync: 'true', zone: 'los.example.test' });
  assert.equal(result.status, 0, result.message);
  assert.equal(result.parameters.SyncPublicDns.IsPresent, true);
  assert.equal(result.parameters.ConfirmDnsZone, 'los.example.test');
});

test('missing DNS environment variable preserves the legacy invocation', () => {
  const result = runContract({
    unsetFlag: true,
    omitted: ['SyncPublicDns', 'ConfirmDnsZone'],
  });
  assert.equal(result.status, 0, result.message);
  assert.equal(result.invoked, true);
  assert.equal(Object.hasOwn(result.parameters, 'SyncPublicDns'), false);
});

for (const omitted of [
  ['SyncPublicDns'],
  ['ConfirmDnsZone'],
  ['SyncPublicDns', 'ConfirmDnsZone'],
]) {
  test(`missing ${omitted.join('/')} rejects requested DNS before script invocation`, () => {
    const result = runContract({
      omitted,
      sync: 'true',
      zone: 'los.example.test',
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.invoked, false);
    assert.match(
      result.message,
      /artifact predates the public DNS deployment contract/,
    );
  });
}

for (const sync of ['TRUE', 'yes', ' true ']) {
  test(`invalid DNS flag ${JSON.stringify(sync)} cannot silently disable DNS`, () => {
    const result = runContract({ sync, zone: 'los.example.test' });
    assert.notEqual(result.status, 0);
    assert.equal(result.invoked, false);
    assert.match(result.message, /AZURE_SYNC_PUBLIC_DNS must be/);
  });
}

test('enabled DNS without a zone fails before script invocation', () => {
  const result = runContract({ sync: 'true', zone: ' ' });
  assert.notEqual(result.status, 0);
  assert.equal(result.invoked, false);
  assert.match(result.message, /AZURE_PUBLIC_DNS_ZONE is required/);
});
