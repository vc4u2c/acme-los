import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultAzureCredential } from '@azure/identity';
import { PhoneNumbersClient } from '@azure/communication-phone-numbers';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..', '..');
const configurationPath = path.join(
  repoRoot,
  'infra',
  'azure',
  'config',
  'platform.json',
);
const supportedActions = new Set(['list', 'search', 'acquire']);
const action = process.argv[2];
const positionalEnvironment =
  process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : undefined;
const environmentName =
  readArgument('--environment') ??
  positionalEnvironment ??
  getNpmConfigStringValue('environment') ??
  'dev';
const confirmPurchase =
  process.argv.includes('--confirm-purchase') ||
  getNpmConfigBoolean('confirm-purchase');

if (!supportedActions.has(action)) {
  console.error(
    'Usage: node tools/scripts/azure/manage-acs-sms-number.mjs <list|search|acquire> [--environment dev] [--confirm-purchase]',
  );
  process.exit(1);
}

function readArgument(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1]?.trim();
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected ${name} to be followed by a value.`);
  }

  return value;
}

function getNpmConfigValue(name) {
  const value = process.env[`npm_config_${name.replaceAll('-', '_')}`];
  return value?.trim() || undefined;
}

function getNpmConfigStringValue(name) {
  const value = getNpmConfigValue(name);
  if (!value || value === 'true' || value === 'false') {
    return undefined;
  }

  return value;
}

function getNpmConfigBoolean(name) {
  const value = getNpmConfigValue(name);
  return value === 'true' || value === '';
}

function readJsonFile(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function resolveCommunicationServicesEndpoint(configuration, environment) {
  const environmentConfiguration = configuration.environments?.[environment];
  if (!environmentConfiguration) {
    throw new Error(`Unknown Azure environment "${environment}".`);
  }

  const resourceName = [
    'acs',
    configuration.organizationShortName,
    configuration.workloadShortName,
    environment,
    configuration.primaryRegionShortName,
    '01',
  ]
    .join('-')
    .toLowerCase();

  return `https://${resourceName}.communication.azure.com`;
}

function supportsOutboundSms(phoneNumber) {
  return ['outbound', 'inboundOutbound'].includes(
    phoneNumber.capabilities?.sms,
  );
}

function printPurchasedPhoneNumber(phoneNumber) {
  console.log(
    JSON.stringify(
      {
        phoneNumber: phoneNumber.phoneNumber,
        countryCode: phoneNumber.countryCode,
        phoneNumberType: phoneNumber.phoneNumberType,
        assignmentType: phoneNumber.assignmentType,
        smsCapability: phoneNumber.capabilities?.sms ?? 'unknown',
      },
      null,
      2,
    ),
  );
}

async function listPurchasedPhoneNumbers(client) {
  const phoneNumbers = [];

  for await (const phoneNumber of client.listPurchasedPhoneNumbers()) {
    phoneNumbers.push(phoneNumber);
  }

  return phoneNumbers;
}

async function searchAvailablePhoneNumber(client) {
  const searchPoller = await client.beginSearchAvailablePhoneNumbers({
    countryCode: 'US',
    phoneNumberType: 'tollFree',
    assignmentType: 'application',
    capabilities: {
      sms: 'outbound',
      calling: 'none',
    },
    quantity: 1,
  });
  const result = await searchPoller.pollUntilDone();

  console.log(
    JSON.stringify(
      {
        searchId: result.searchId,
        phoneNumbers: result.phoneNumbers,
        searchExpiresBy: result.searchExpiresBy,
        cost: result.cost,
      },
      null,
      2,
    ),
  );

  return result;
}

async function main() {
  const configuration = readJsonFile(configurationPath);
  const endpoint = resolveCommunicationServicesEndpoint(
    configuration,
    environmentName,
  );
  const credential = new DefaultAzureCredential();
  const client = new PhoneNumbersClient(endpoint, credential);
  const purchasedPhoneNumbers = await listPurchasedPhoneNumbers(client);

  if (action === 'list') {
    if (purchasedPhoneNumbers.length === 0) {
      console.log(`No purchased ACS phone numbers were found at ${endpoint}.`);
      return;
    }

    for (const phoneNumber of purchasedPhoneNumbers) {
      printPurchasedPhoneNumber(phoneNumber);
    }
    return;
  }

  const existingSmsNumber = purchasedPhoneNumbers.find(supportsOutboundSms);
  if (existingSmsNumber) {
    console.log(
      `Reusing existing ACS phone number with outbound SMS capability for "${environmentName}".`,
    );
    printPurchasedPhoneNumber(existingSmsNumber);
    return;
  }

  if (action === 'acquire' && !confirmPurchase) {
    throw new Error(
      'The acquire action purchases an ACS phone number and creates an Azure charge. Rerun with --confirm-purchase.',
    );
  }

  const searchResult = await searchAvailablePhoneNumber(client);
  if (action === 'search') {
    console.log(
      'Search reserved a candidate temporarily. Run acquire --confirm-purchase to search again and purchase an available number.',
    );
    return;
  }

  const purchasePoller = await client.beginPurchasePhoneNumbers(
    searchResult.searchId,
  );
  await purchasePoller.pollUntilDone();

  console.log(`Purchased ACS SMS phone number for "${environmentName}".`);
  const refreshedPhoneNumbers = await listPurchasedPhoneNumbers(client);
  const purchasedSmsNumber = refreshedPhoneNumbers.find(supportsOutboundSms);

  if (!purchasedSmsNumber) {
    throw new Error(
      'Purchase completed but an outbound SMS-capable phone number was not returned.',
    );
  }

  printPurchasedPhoneNumber(purchasedSmsNumber);
  console.log(
    `Add "${purchasedSmsNumber.phoneNumber}" to infra/azure/config/platform.json at environments.${environmentName}.smsMfa.senderPhoneNumber after toll-free verification is approved.`,
  );
}

await main();
