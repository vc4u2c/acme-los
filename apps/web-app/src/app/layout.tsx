import './global.css';
import { SiteFooter } from '../components/web/site-footer';
import { ThemeScript } from '../components/web/theme-script';

export const metadata = {
  title: 'ACME LOS Installment Flow',
  description: 'Responsive installment loan intake experience for ACME LOS.',
  icons: {
    icon: [
      {
        url: '/acme-tab-icon.svg?v=2',
        type: 'image/svg+xml',
      },
    ],
    shortcut: [
      {
        url: '/acme-tab-icon.svg?v=2',
        type: 'image/svg+xml',
      },
    ],
    apple: [
      {
        url: '/acme-tab-icon.svg?v=2',
        type: 'image/svg+xml',
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
        <ThemeScript />
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
      </body>
    </html>
  );
}
