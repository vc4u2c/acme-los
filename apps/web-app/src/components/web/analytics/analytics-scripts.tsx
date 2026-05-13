import * as React from 'react';
import Script from 'next/script';
import { getAnalyticsRuntimeConfig } from '../../../lib/analytics/config';
import { toGoogleConsentDefaults } from '../../../lib/analytics/data-layer';

function buildBootstrapScript(): string {
  const config = getAnalyticsRuntimeConfig();
  const consentDefaults = toGoogleConsentDefaults(config.consent);
  const lines = [
    'window.dataLayer = window.dataLayer || [];',
    'function gtag(){window.dataLayer.push(arguments);}',
    `gtag('consent', 'default', ${JSON.stringify(consentDefaults)});`,
    `window.dataLayer.push(${JSON.stringify({
      event: 'acme_analytics_bootstrap',
      environment: config.environment,
      analytics_mode: config.mode,
    })});`,
  ];

  if (config.mode === 'gtag' && config.ga4MeasurementId) {
    lines.push("gtag('js', new Date());");
    lines.push(
      `gtag('config', ${JSON.stringify(config.ga4MeasurementId)}, ${JSON.stringify(
        {
          send_page_view: false,
        },
      )});`,
    );
  }

  return lines.join('\n');
}

export function AnalyticsScripts(): React.ReactElement | null {
  const config = getAnalyticsRuntimeConfig();

  if (!config.enabled) {
    return null;
  }

  const googleScriptSource =
    config.mode === 'gtm'
      ? `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(
          config.gtmContainerId,
        )}`
      : `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
          config.ga4MeasurementId,
        )}`;

  return (
    <>
      <Script
        id="acme-analytics-bootstrap"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: buildBootstrapScript() }}
      />
      <Script
        id={
          config.mode === 'gtm' ? 'acme-google-tag-manager' : 'acme-google-tag'
        }
        strategy="afterInteractive"
        src={googleScriptSource}
      />
    </>
  );
}
