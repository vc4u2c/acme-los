import './global.css';
import { AnalyticsScripts } from '../components/web/analytics/analytics-scripts';
import { AppProviders } from '../components/web/providers/app-providers';
import { SiteFooter } from '../components/web/site-footer';
import { ThemeScript } from '../components/web/theme-script';

export const metadata = {
  title: 'ACME LOS Installment Flow',
  description: 'Responsive installment loan intake experience for ACME LOS.',
  icons: {
    icon: [
      {
        url: '/acme-mark.svg?v=1',
        type: 'image/svg+xml',
      },
      {
        url: '/favicon.ico?v=4',
        sizes: 'any',
      },
    ],
    shortcut: [
      {
        url: '/favicon.ico?v=4',
      },
    ],
    apple: [
      {
        url: '/acme-mark.png?v=1',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="light"
      data-scroll-behavior="smooth"
    >
      <body className="min-h-screen">
        <AnalyticsScripts />
        <ThemeScript />
        <AppProviders>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <div className="flex min-h-screen flex-col">
            <div
              id="main-content"
              tabIndex={-1}
              className="flex-1 focus:outline-none"
            >
              {children}
            </div>
            <SiteFooter />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
