import * as React from 'react';

type FeatureCardProps = {
  title: string;
  copy: string;
  children: React.ReactNode;
};

function VisualFrame({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-[1.6rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm shadow-[color:var(--shadow-soft)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[var(--surface-accent)] to-transparent opacity-80" />
      <div className="relative">{children}</div>
    </div>
  );
}

function ReviewDocumentGraphic(): React.ReactElement {
  return (
    <VisualFrame className="aspect-[1.25/1]">
      <div className="relative mx-auto mt-5 h-40 max-w-[16rem]">
        <div className="absolute left-3 top-6 h-28 w-24 rotate-[-10deg] rounded-[1rem] border border-[var(--border)] bg-[var(--surface-strong)] shadow-sm" />
        <div className="absolute right-3 top-6 h-28 w-24 rotate-[10deg] rounded-[1rem] border border-[var(--border)] bg-[var(--surface-strong)] shadow-sm" />
        <div className="absolute left-1/2 top-1 h-32 w-28 -translate-x-1/2 rounded-[1rem] border border-[var(--border-strong)] bg-[var(--surface-strong)] shadow-lg shadow-[color:var(--shadow-soft)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground)]">
            Soft review
          </div>
          <div className="space-y-2 px-4 py-3">
            <div className="h-2 rounded-full bg-[var(--surface-accent)]" />
            <div className="h-2 w-4/5 rounded-full bg-[var(--surface-accent)]" />
            <div className="h-2 w-3/5 rounded-full bg-[var(--surface-accent)]" />
            <div className="mt-4 inline-flex rounded-full bg-[var(--brand)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-contrast)]">
              Reviewed
            </div>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

function SoftReviewGraphic(): React.ReactElement {
  return (
    <VisualFrame className="aspect-[1.25/1] flex items-center justify-center">
      <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] px-8 py-7 shadow-sm">
        <div className="mx-auto h-28 w-28 rounded-full border-[6px] border-[var(--surface-accent)] border-t-[var(--brand)] border-l-[var(--brand)] border-r-[var(--brand)]" />
        <p className="-mt-16 text-center text-4xl font-semibold tracking-tight text-[var(--foreground)]">
          620
        </p>
        <div className="mt-11 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--brand)]">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
            i
          </span>
          No hard pull
        </div>
      </div>
    </VisualFrame>
  );
}

function OfferGraphic(): React.ReactElement {
  return (
    <VisualFrame className="aspect-[1.25/1] flex items-center justify-center">
      <div className="w-full max-w-[15rem] rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] px-6 py-6 text-center shadow-sm">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-accent)] shadow-inner">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)]">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12 4 4 10-10" />
            </svg>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-[var(--muted-foreground)]">
          Estimated offer
        </p>
        <p className="mt-2 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
          $1,500
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          before documents and signing
        </p>
      </div>
    </VisualFrame>
  );
}

export function PreapprovalFeatureCard({
  title,
  copy,
  children,
}: FeatureCardProps): React.ReactElement {
  return (
    <article className="space-y-4">
      {children}
      <div className="space-y-2">
        <h3 className="text-[1.65rem] font-semibold leading-tight text-[var(--foreground)]">
          {title}
        </h3>
        <p className="text-base leading-7 text-[var(--muted-foreground)]">
          {copy}
        </p>
      </div>
    </article>
  );
}

export const preapprovalGraphics = [
  {
    title: 'Fast online review',
    copy: 'Customers can see the preapproval step quickly without feeling dropped into a document maze.',
    visual: <ReviewDocumentGraphic />,
  },
  {
    title: 'No hard-credit surprise',
    copy: 'Use a soft-review checkpoint first so the value is obvious before the customer commits to the next step.',
    visual: <SoftReviewGraphic />,
  },
  {
    title: 'Confidence before funding',
    copy: 'Surface the likely outcome and explain the handoff into documents, signing, and funding.',
    visual: <OfferGraphic />,
  },
] as const;
