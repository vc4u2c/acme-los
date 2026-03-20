import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');

const environmentName = process.argv[2];
const action = process.argv[3];
const passthroughIndex = process.argv.indexOf('--');
const passthroughArgs =
  passthroughIndex >= 0 ? process.argv.slice(passthroughIndex + 1) : [];

if (!environmentName || !action) {
  console.error(
    'Usage: node tools/scripts/okta/run-terraform.mjs <dev|qa|stg|prod> <init|plan|apply|output> [-- <terraform args>]',
  );
  process.exit(1);
}

const terraformDirectory = path.join(repoRoot, 'infra', 'okta', 'terraform');
const terraformVariablesPath = path.join(
  repoRoot,
  'tmp',
  'okta',
  `${environmentName}.terraform.auto.tfvars.json`,
);
const terraformOutputsPath = path.join(
  repoRoot,
  'tmp',
  'okta',
  `${environmentName}.terraform.outputs.json`,
);

if (!fs.existsSync(terraformVariablesPath)) {
  console.error(
    `Missing ${path.relative(repoRoot, terraformVariablesPath)}. Run "npm run okta:render -- ${environmentName}" first.`,
  );
  process.exit(1);
}

const terraformCommand =
  process.platform === 'win32' ? 'terraform.exe' : 'terraform';
const secretsRequired = action !== 'init';

if (secretsRequired) {
  const hasApiToken = process.env.OKTA_API_TOKEN?.trim();

  if (!hasApiToken) {
    if (!process.env.OKTA_TERRAFORM_CLIENT_ID?.trim()) {
      console.error(
        'Set OKTA_API_TOKEN, or set OKTA_TERRAFORM_CLIENT_ID with OKTA_TERRAFORM_PRIVATE_KEY_PATH/PEM before running Terraform.',
      );
      process.exit(1);
    }

    const hasPrivateKeyPath =
      process.env.OKTA_TERRAFORM_PRIVATE_KEY_PATH?.trim();
    const hasPrivateKeyPem = process.env.OKTA_TERRAFORM_PRIVATE_KEY_PEM?.trim();

    if (!hasPrivateKeyPath && !hasPrivateKeyPem) {
      console.error(
        'Set OKTA_API_TOKEN, or set OKTA_TERRAFORM_PRIVATE_KEY_PATH / OKTA_TERRAFORM_PRIVATE_KEY_PEM before running Terraform.',
      );
      process.exit(1);
    }
  }
}

function runTerraform(args) {
  const child = spawnSync(terraformCommand, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      TF_IN_AUTOMATION: 'true',
      TF_VAR_okta_api_token: process.env.OKTA_API_TOKEN ?? '',
      TF_VAR_okta_api_service_client_id:
        process.env.OKTA_TERRAFORM_CLIENT_ID ?? '',
      TF_VAR_okta_api_private_key_path:
        process.env.OKTA_TERRAFORM_PRIVATE_KEY_PATH ?? '',
      TF_VAR_okta_api_private_key_pem:
        process.env.OKTA_TERRAFORM_PRIVATE_KEY_PEM ?? '',
    },
  });

  if (child.error) {
    console.error(
      `Failed to run Terraform. Make sure Terraform 1.8.5 or later is installed and available on PATH.\n${child.error.message}`,
    );
    process.exit(1);
  }

  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

function syncOutputs() {
  const outputCapture = spawnSync(
    terraformCommand,
    ['-chdir=infra/okta/terraform', 'output', '-json'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        TF_IN_AUTOMATION: 'true',
        TF_VAR_okta_api_token: process.env.OKTA_API_TOKEN ?? '',
        TF_VAR_okta_api_service_client_id:
          process.env.OKTA_TERRAFORM_CLIENT_ID ?? '',
        TF_VAR_okta_api_private_key_path:
          process.env.OKTA_TERRAFORM_PRIVATE_KEY_PATH ?? '',
        TF_VAR_okta_api_private_key_pem:
          process.env.OKTA_TERRAFORM_PRIVATE_KEY_PEM ?? '',
      },
      encoding: 'utf8',
    },
  );

  if (outputCapture.error || outputCapture.status !== 0) {
    const message =
      outputCapture.error?.message ??
      outputCapture.stderr ??
      'Unknown Terraform output failure.';
    console.error(`Failed to capture Terraform outputs.\n${message}`);
    process.exit(1);
  }

  const parsed = JSON.parse(outputCapture.stdout);
  const normalized = {
    environment: environmentName,
    webClientId: parsed.web_app_client_id?.value ?? '',
    webAppId: parsed.web_app_id?.value ?? '',
    mobileClientId: parsed.mobile_app_client_id?.value ?? '',
    mobileAppId: parsed.mobile_app_id?.value ?? '',
    customerGroupId: parsed.customer_group_id?.value ?? '',
    trustedOriginId: parsed.web_trusted_origin_id?.value ?? '',
    brandId: parsed.default_brand_id?.value ?? '',
    themeId: parsed.default_theme_id?.value ?? '',
  };

  fs.mkdirSync(path.dirname(terraformOutputsPath), { recursive: true });
  fs.writeFileSync(
    terraformOutputsPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf8',
  );

  const renderResult = spawnSync(
    process.execPath,
    [path.join(scriptDirectory, 'render-auth-config.mjs'), environmentName],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (renderResult.status !== 0) {
    process.exit(renderResult.status ?? 1);
  }

  console.log(
    `Synced Terraform outputs to ${path.relative(repoRoot, terraformOutputsPath)}.`,
  );
}

const baseArgs = ['-chdir=infra/okta/terraform'];

switch (action) {
  case 'init':
    runTerraform([...baseArgs, 'init', ...passthroughArgs]);
    break;
  case 'plan':
    runTerraform([
      ...baseArgs,
      'plan',
      `-var-file=${path.relative(terraformDirectory, terraformVariablesPath)}`,
      ...passthroughArgs,
    ]);
    break;
  case 'apply':
    runTerraform([
      ...baseArgs,
      'apply',
      `-var-file=${path.relative(terraformDirectory, terraformVariablesPath)}`,
      ...passthroughArgs,
    ]);
    syncOutputs();
    break;
  case 'output':
    syncOutputs();
    break;
  default:
    console.error(
      `Unsupported action "${action}". Use one of: init, plan, apply, output.`,
    );
    process.exit(1);
}
