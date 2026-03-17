'use client';

import * as React from 'react';
import Link from 'next/link';
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

export default function ShowcasePage() {
  const [email, setEmail] = React.useState('team@acme-los.dev');
  const navigationItems = [
    { href: '/', label: 'Home' },
    { href: '/apply/personal-info', label: 'Application' },
  ];

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="site-shell py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-[var(--brand)] transition hover:text-[var(--brand-strong)]"
          >
            Back to web home
          </Link>
        </div>

        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-[var(--brand)]">
            UI Showcase
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight text-[var(--foreground)]">
            Web primitives in one place
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            This route exercises the current shadcn-style primitives from
            `@acme-los/ui-web` so we have a durable surface for future UI work
            and a cleaner reference point for matching the mobile showcase.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]">
            <CardHeader>
              <CardTitle className="font-display text-[var(--foreground)]">
                Input + Card
              </CardTitle>
              <CardDescription className="text-[var(--muted-foreground)]">
                Shared form primitives for release settings, account details,
                and operational workflows.
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
                Save draft
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
                  <div className="mt-6 space-y-3">
                    <Card className="border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)]">
                      <CardContent className="pt-6">
                        <p className="text-sm text-[var(--muted-foreground)]">
                          Target: `main`
                        </p>
                        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                          Package versions and promotion notes can live here
                          without pulling the user off the page.
                        </p>
                      </CardContent>
                    </Card>
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
      </section>
    </main>
  );
}
