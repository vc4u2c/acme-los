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

export default function ShowcasePage() {
  const [email, setEmail] = React.useState('team@acme-los.dev');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto max-w-6xl px-6 py-16 lg:px-10">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            Back to web home
          </Link>
        </div>

        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
            UI Showcase
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white">
            Web primitives in one place
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            This route exercises the current shadcn-style primitives from
            `@acme-los/ui-web` so we have a durable surface for future UI work
            and a cleaner reference point for matching the mobile showcase.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-800 bg-slate-900 text-slate-50">
            <CardHeader>
              <CardTitle className="text-white">Input + Card</CardTitle>
              <CardDescription className="text-slate-400">
                Shared form primitives for release settings, account details,
                and operational workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">
                  Notification Email
                </label>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="border-slate-700 bg-slate-950 text-slate-50 placeholder:text-slate-500"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  defaultValue="Release Manager"
                  className="border-slate-700 bg-slate-950 text-slate-50"
                />
                <Input
                  defaultValue="prod-approval"
                  className="border-slate-700 bg-slate-950 text-slate-50"
                />
              </div>
            </CardContent>
            <CardFooter className="gap-3">
              <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                Save draft
              </Button>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-100 hover:bg-slate-800"
              >
                Secondary action
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-slate-50">
            <CardHeader>
              <CardTitle className="text-white">Dialog + Sheet</CardTitle>
              <CardDescription className="text-slate-400">
                Overlay primitives for explicit approvals, details, and side
                workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
                    Open dialog
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-slate-800 bg-slate-950 text-slate-50">
                  <DialogHeader>
                    <DialogTitle className="text-white">
                      Confirm release window
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Dialogs work best when the user needs to make a deliberate
                      decision before continuing.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      className="border-slate-700 text-slate-100 hover:bg-slate-900"
                    >
                      Cancel
                    </Button>
                    <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                      Confirm
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-slate-700 text-slate-100 hover:bg-slate-800"
                  >
                    Open sheet
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="border-slate-800 bg-slate-950 text-slate-50"
                >
                  <SheetHeader>
                    <SheetTitle className="text-white">
                      Release sidebar
                    </SheetTitle>
                    <SheetDescription className="text-slate-400">
                      Sheets are handy for side-panel details that should stay
                      connected to the current page context.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-3">
                    <Card className="border-slate-800 bg-slate-900 text-slate-50">
                      <CardContent className="pt-6">
                        <p className="text-sm text-slate-300">Target: `main`</p>
                        <p className="mt-2 text-sm text-slate-300">
                          Package versions and promotion notes can live here
                          without pulling the user off the page.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <SheetFooter className="mt-6">
                    <Button className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">
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
