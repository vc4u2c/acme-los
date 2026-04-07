//@ts-check

const { composePlugins, withNx } = require('@nx/next');
const { version } = require('./package.json');

function buildContentSecurityPolicy() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const oktaIssuer = process.env.NEXT_PUBLIC_OKTA_ISSUER;
  const oktaOrigin = oktaIssuer ? new URL(oktaIssuer).origin : null;
  const connectSrc = new Set(["'self'"]);
  const formAction = new Set(["'self'"]);

  if (oktaOrigin) {
    connectSrc.add(oktaOrigin);
    formAction.add(oktaOrigin);
  }

  if (isDevelopment) {
    connectSrc.add('ws:');
    connectSrc.add('wss:');
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    `form-action ${Array.from(formAction).join(' ')}`,
    `connect-src ${Array.from(connectSrc).join(' ')}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  ];

  if (
    !isDevelopment &&
    process.env.ACME_ENABLE_HTTPS_HEADERS?.trim().toLowerCase() === 'true'
  ) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
  output: 'standalone',
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: buildContentSecurityPolicy(),
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
