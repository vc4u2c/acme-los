import * as React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

function baseProps(props: IconProps) {
  return {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    ...props,
  };
}

export function SunIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.75v2.5" />
      <path d="M12 18.75v2.5" />
      <path d="m4.93 4.93 1.77 1.77" />
      <path d="m17.3 17.3 1.77 1.77" />
      <path d="M2.75 12h2.5" />
      <path d="M18.75 12h2.5" />
      <path d="m4.93 19.07 1.77-1.77" />
      <path d="m17.3 6.7 1.77-1.77" />
    </svg>
  );
}

export function MoonIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="M20.08 14.62A8.6 8.6 0 1 1 9.38 3.92a7.15 7.15 0 0 0 10.7 10.7Z" />
    </svg>
  );
}

export function UserCircleIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 10.1a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z" />
      <path d="M6.9 18.1a6.4 6.4 0 0 1 10.2 0" />
    </svg>
  );
}

export function AcmeMarkIcon(props: IconProps): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M16 4.5 6.75 27.5h4.4l1.95-5.05h5.8l1.95 5.05h4.4L16 4.5Zm-1.55 13.15L16 13.1l1.55 4.55h-3.1Z"
        fill="currentColor"
      />
      <path d="M22.75 7.5h3.4v3.4h-3.4z" fill="currentColor" opacity="0.72" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="m6.5 9.5 5.5 5 5.5-5" />
    </svg>
  );
}

export function MenuIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="M4.5 7.5h15" />
      <path d="M4.5 12h15" />
      <path d="M4.5 16.5h15" />
    </svg>
  );
}

export function XIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="m6.75 6.75 10.5 10.5" />
      <path d="m17.25 6.75-10.5 10.5" />
    </svg>
  );
}

export function InfoIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10v5" />
      <path d="M12 7.4h.01" />
    </svg>
  );
}

export function LogInIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="M13 6.5h4.5v11H13" />
      <path d="m10 8.5-3.5 3.5L10 15.5" />
      <path d="M6.5 12H16" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="M11 6.5H6.5v11H11" />
      <path d="m14 8.5 3.5 3.5-3.5 3.5" />
      <path d="M8 12h9.5" />
    </svg>
  );
}

export function ClipboardIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="M9 5.5h6" />
      <path d="M9.5 4h5a1.5 1.5 0 0 1 1.5 1.5v1H8V5.5A1.5 1.5 0 0 1 9.5 4Z" />
      <path d="M7.5 6.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function SupportIcon(props: IconProps): React.ReactElement {
  return (
    <svg aria-hidden="true" {...baseProps(props)}>
      <path d="M5.5 12a6.5 6.5 0 0 1 13 0" />
      <path d="M6 12v3.25A1.75 1.75 0 0 0 7.75 17H9.5" />
      <path d="M18 12v2.75A2.25 2.25 0 0 1 15.75 17H14" />
      <path d="M9.5 18.5h4" />
      <path d="M6.5 13.5h-1v-2h1" />
      <path d="M18.5 13.5h-1v-2h1" />
    </svg>
  );
}
