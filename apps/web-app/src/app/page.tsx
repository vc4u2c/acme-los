import Link from 'next/link';
import { Button } from '@acme-los/ui-web';
import webAppPackage from '../../package.json';

const webAppVersion = webAppPackage.version;

export default function Index() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:px-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div className="inline-flex w-fit items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200">
            ACME LOS backbone
          </div>
          <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200">
            Web version {webAppVersion}
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.3em] text-slate-400">
              Next.js + Expo + Nx
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Welcome web-app
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              The web shell is ready for shared LOS domain modules, API
              contracts, and a reusable UI system that stays aligned with the
              mobile experience.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              >
                <Link href="/showcase">Open UI showcase</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-slate-700 text-slate-100 hover:border-slate-500 hover:bg-slate-900"
              >
                <Link href="#commands">View next commands</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-slate-700 text-slate-100 hover:border-slate-500 hover:bg-slate-900"
              >
                <a href="https://nx.dev" target="_blank" rel="noreferrer">
                  Nx docs
                </a>
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-emerald-950/20 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Active stack
            </p>
            <div className="mt-4 grid gap-3">
              {[
                'Next.js web application',
                'Expo mobile application',
                'Playwright e2e coverage',
                'Shared web + mobile UI libraries',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-200"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold text-emerald-300">Core</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Shared types, config, utilities, and logging foundations for LOS
              workflows.
            </p>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold text-cyan-300">Domain</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Borrower, loan, application, and underwriting modules with
              enforced boundaries.
            </p>
          </article>
          <article className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold text-fuchsia-300">API + UI</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              API contracts, API clients, and platform UI libraries for web and
              mobile.
            </p>
          </article>
        </div>

        <section
          id="commands"
          className="mt-16 rounded-[2rem] border border-slate-800 bg-slate-900/70 p-8"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Commands
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Useful next steps
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/70 p-5">
              <p className="text-sm font-medium text-slate-200">Run web app</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-sm text-emerald-200">
                npx.cmd nx run web-app:dev
              </pre>
            </div>
            <div className="rounded-2xl bg-slate-950/70 p-5">
              <p className="text-sm font-medium text-slate-200">
                Run mobile app
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-sm text-cyan-200">
                npx.cmd nx run mobile-app:start
              </pre>
            </div>
            <div className="rounded-2xl bg-slate-950/70 p-5">
              <p className="text-sm font-medium text-slate-200">Run tests</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-sm text-fuchsia-200">
                npx.cmd nx run-many -t test
              </pre>
            </div>
            <div className="rounded-2xl bg-slate-950/70 p-5">
              <p className="text-sm font-medium text-slate-200">
                Inspect dependency graph
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 text-sm text-amber-200">
                npx.cmd nx graph
              </pre>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
