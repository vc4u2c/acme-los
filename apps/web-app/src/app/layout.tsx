import './global.css';
import { SiteFooter } from '../components/web/site-footer';
import { ThemeScript } from '../components/web/theme-script';

export const metadata = {
  title: 'ACME LOS Installment Flow',
  description: 'Responsive installment loan intake experience for ACME LOS.',
  icons: {
    icon: '/acme-tab-icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light">
      <body className="min-h-screen">
        <ThemeScript />
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
