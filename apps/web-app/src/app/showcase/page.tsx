'use client';

import * as React from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@acme-los/ui-web';
import { SiteHeader } from '../../components/web/site-header';
import { ShowcaseGridDemo } from './showcase-grid-demo';

type ShowcaseTab = 'grids' | 'primitives';

function getTabClassName(isActive: boolean): string {
  return [
    'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
    isActive
      ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)]'
      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]',
  ].join(' ');
}

function PrimitiveShowcase(): React.ReactElement {
  const [email, setEmail] = React.useState('team@acme-los.dev');

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
        <CardHeader>
          <CardTitle className="font-display text-[var(--foreground)]">
            Input + Card
          </CardTitle>
          <CardDescription className="text-[var(--muted-foreground)]">
            Shared form primitives for release settings, account details, and
            operational workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--foreground)]">
              Notification Email
            </label>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              defaultValue="Release Manager"
              className="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)]"
            />
            <Input
              defaultValue="prod-approval"
              className="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)]"
            />
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button className="bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]">
            Continue flow
          </Button>
          <Button
            variant="outline"
            className="border-[var(--border-strong)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
          >
            Secondary action
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
        <CardHeader>
          <CardTitle className="font-display text-[var(--foreground)]">
            Dialog + Sheet
          </CardTitle>
          <CardDescription className="text-[var(--muted-foreground)]">
            Overlay primitives for explicit approvals, details, and side
            workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]">
                Open dialog
              </Button>
            </DialogTrigger>
            <DialogContent className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
              <DialogHeader>
                <DialogTitle className="font-display text-[var(--foreground)]">
                  Confirm release window
                </DialogTitle>
                <DialogDescription className="text-[var(--muted-foreground)]">
                  Dialogs work best when the user needs to make a deliberate
                  decision before continuing.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="border-[var(--border-strong)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
                >
                  Cancel
                </Button>
                <Button className="bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]">
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="border-[var(--border-strong)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
              >
                Open sheet
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
            >
              <SheetHeader>
                <SheetTitle className="font-display text-[var(--foreground)]">
                  Release sidebar
                </SheetTitle>
                <SheetDescription className="text-[var(--muted-foreground)]">
                  Sheets are handy for side-panel details that should stay
                  connected to the current page context.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-[var(--foreground)]">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Target: `main`
                </p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Package versions and promotion notes can live here without
                  pulling the user off the page.
                </p>
              </div>
              <SheetFooter className="mt-6">
                <Button className="bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-strong)]">
                  Continue
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ShowcasePage() {
  const [activeTab, setActiveTab] = React.useState<ShowcaseTab>('grids');
  const navigationItems = [
    { href: '/', label: 'Home' },
    { href: '/apply/personal-info', label: 'Application' },
  ];

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="site-shell py-12">
        <div className="max-w-3xl">
          <p className="text-sm uppercase text-[var(--brand)]">UI Showcase</p>
          <h1 className="mt-4 font-display text-5xl font-semibold text-[var(--foreground)]">
            Web primitives in one place
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            This route exercises the current `@acme-los/ui-web` primitives and
            the richer application patterns we expect in lending workflows:
            responsive controls, tabbed surfaces, and data-dense grids.
          </p>
        </div>

        <div
          className="mt-10 flex flex-wrap gap-3"
          role="tablist"
          aria-label="Showcase sections"
        >
          <button
            id="showcase-tab-grids"
            type="button"
            role="tab"
            aria-controls="showcase-panel-grids"
            aria-selected={activeTab === 'grids'}
            className={getTabClassName(activeTab === 'grids')}
            onClick={() => setActiveTab('grids')}
          >
            Data grids
          </button>
          <button
            id="showcase-tab-primitives"
            type="button"
            role="tab"
            aria-controls="showcase-panel-primitives"
            aria-selected={activeTab === 'primitives'}
            className={getTabClassName(activeTab === 'primitives')}
            onClick={() => setActiveTab('primitives')}
          >
            Web primitives
          </button>
        </div>

        <div className="mt-8">
          {activeTab === 'grids' ? (
            <section
              id="showcase-panel-grids"
              role="tabpanel"
              aria-labelledby="showcase-tab-grids"
            >
              <ShowcaseGridDemo />
            </section>
          ) : (
            <section
              id="showcase-panel-primitives"
              role="tabpanel"
              aria-labelledby="showcase-tab-primitives"
            >
              <PrimitiveShowcase />
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
