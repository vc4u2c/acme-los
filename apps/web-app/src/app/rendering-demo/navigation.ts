export const renderingDemoNavigationItems = [
  { href: '/rendering-demo', label: 'Overview', match: 'exact' as const },
  { href: '/rendering-demo/static', label: 'Static route' },
  { href: '/rendering-demo/isr', label: 'ISR route' },
  { href: '/rendering-demo/server', label: 'Server route' },
  { href: '/rendering-demo/client', label: 'Client route' },
] as const;
