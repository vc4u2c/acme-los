import Link from 'next/link';
import {
  BadgeCheck,
  Clock3,
  Headphones,
  Landmark,
  Route,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from '@acme-los/ui-web';
import { SiteHeader } from '../components/web/site-header';
import { StartApplicationButton } from '../components/web/start-application-button';
import { applicationSteps } from '../components/web/apply/step-definitions';
import {
  PreapprovalFeatureCard,
  preapprovalGraphics,
} from '../components/web/preapproval-graphics';

export const dynamic = 'force-static';

type LandingCard = {
  title: string;
  copy: string;
  icon: LucideIcon;
  detail?: string;
};

const processFlowNotes = [
  {
    title: 'Timing and handoff',
    copy: 'Banking, signing, and funding arrive in sequence, with the next checkpoint visible before the form asks for more.',
  },
];

const whyUsHighlights: LandingCard[] = [
  {
    title: 'Support is one click away',
    copy: 'Phone, contact, and rate details stay inside the shell.',
    icon: Headphones,
  },
  {
    title: 'Disclosures show up earlier',
    copy: 'The customer understands consent and timing before banking details.',
    icon: ShieldCheck,
  },
  {
    title: 'Progress stays visible',
    copy: 'Every stage feels like forward motion, not a reset.',
    icon: Route,
  },
];

const whyUsProofCards: LandingCard[] = [
  {
    title: 'Timing is explained up front',
    copy: 'The flow makes room for the questions people actually ask: when funds land, when disclosures appear, and what happens after review.',
    icon: Clock3,
  },
  {
    title: 'Completion feels more realistic',
    copy: 'Route-based steps, guarded progress, and guided validation help customers finish without making the experience feel rushed.',
    icon: BadgeCheck,
  },
];

const trustChecklist: LandingCard[] = [
  {
    title: 'Contact and address before bank account details',
    copy: 'Open with the details people expect to share first.',
    icon: Headphones,
  },
  {
    title: 'Disclosures before soft-review consent',
    copy: 'Policy and timing context arrives before the flow asks for more trust.',
    icon: ShieldCheck,
  },
  {
    title: 'Funding expectations before final submission',
    copy: 'Completion feels more credible when the handoff is already visible.',
    icon: Landmark,
  },
];

const navigationItems = [
  { href: '#preapproval', label: 'Preapproval' },
  { href: '#why-us', label: 'Why us' },
  { href: '#process', label: 'Process' },
  { href: '#trust', label: 'Trust' },
  { href: '#faq', label: 'FAQ' },
];

export default function Index() {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />

      <section className="site-shell py-10 lg:py-14">
        <div className="mx-auto max-w-5xl space-y-8 text-center">
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
              Calm, clear, conversion-ready
            </p>
            <h1 className="mx-auto max-w-4xl font-display text-4xl leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
              A steadier installment application that feels thoughtful before it
              feels transactional.
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-8 text-[var(--muted-foreground)]">
              Lead with identity and disclosures, keep support in view, and move
              through income, banking, pre-approval, signing, and funding with a
              cleaner sense of pacing from the very first answer.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <StartApplicationButton />
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-[var(--border-strong)] bg-[color:var(--surface)/0.86] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
            >
              <Link href="/showcase">See the experience library</Link>
            </Button>
          </div>

          <div className="mx-auto max-w-3xl space-y-3 text-left">
            {[
              {
                icon: Headphones,
                title: 'Support stays present',
                copy: 'Contact, timing, and rates stay inside the shell instead of disappearing into forms.',
              },
              {
                icon: ShieldCheck,
                title: 'Trust arrives in order',
                copy: 'Disclosures and identity context land before the journey asks for more sensitive details.',
              },
              {
                icon: Landmark,
                title: 'Funding is not buried',
                copy: 'The last-mile handoff is visible early, which makes completion feel more credible.',
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 border-l-2 border-[var(--border-strong)] pl-4"
                >
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color:var(--overlay-surface)/0.92] text-[var(--brand)] shadow-sm">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                      {item.copy}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {[
              'No hard pull before review',
              'Seven visible steps',
              'Support stays in the shell',
              'Funding timing stays visible',
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[var(--border)] bg-[color:var(--overlay-surface)/0.88] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section
        id="preapproval"
        data-scroll-section="true"
        className="site-shell py-6 lg:py-8"
      >
        <div className="grid gap-6 rounded-[2rem] border border-[var(--border)] bg-[color:var(--surface)/0.96] p-6 shadow-xl shadow-[color:var(--shadow-soft)] lg:grid-cols-[0.92fr_1.08fr] lg:p-7">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
              Preapproval, lightning fast
            </p>
            <h2 className="max-w-2xl font-display text-4xl leading-tight text-[var(--foreground)] lg:text-5xl">
              Give customers a quick read on what comes next.
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
              Make the soft-review step feel fast, understandable, and worth
              continuing. The handoff into documents, signing, and funding
              should feel visible before the application asks for more trust.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'Soft review first',
                'No hard pull surprise',
                'Clear next step',
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {preapprovalGraphics.map((item) => (
              <PreapprovalFeatureCard
                key={item.title}
                title={item.title}
                copy={item.copy}
              >
                {item.visual}
              </PreapprovalFeatureCard>
            ))}
          </div>
        </div>
      </section>

      <section
        id="why-us"
        data-scroll-section="true"
        className="site-shell py-7 lg:py-10"
      >
        <div className="mb-7 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Why customers choose us
          </p>
          <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--foreground)] lg:text-5xl">
            Clear support, cleaner pacing, fewer late surprises.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[var(--muted-foreground)]">
            The strongest intake experiences answer the practical questions
            early: who can help, when funding decisions show up, and why the
            application is asking for the next piece of information.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <article className="rounded-[1.9rem] border border-[var(--border)] bg-[color:var(--surface)/0.95] p-6 shadow-xl shadow-[color:var(--shadow-soft)] lg:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
              Why us
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-[var(--foreground)]">
              We reduce friction where financial applications usually lose
              trust.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
              Customers get support cues, timing context, and a readable next
              step before the application asks for more detail. That pacing
              makes the journey feel guided instead of transactional.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {whyUsHighlights.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-[0.95rem] border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)] shadow-sm">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                      {item.copy}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>

          <div className="grid gap-4 self-start">
            {whyUsProofCards.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="rounded-[1.7rem] border border-[var(--border)] bg-[color:var(--surface)/0.92] p-5 shadow-lg shadow-[color:var(--shadow-soft)]"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)] shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 font-display text-3xl text-[var(--foreground)]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-base leading-8 text-[var(--muted-foreground)]">
                    {item.copy}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="process"
        data-scroll-section="true"
        className="site-shell py-7 lg:py-10"
      >
        <div className="mb-7 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            Process preview
          </p>
          <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--foreground)] lg:text-5xl">
            A seven-step flow with no sudden jumps.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[var(--muted-foreground)]">
            Applicants move from basics to banking, then into pre-approval,
            signing, and funding. Each stage explains what comes next before
            asking for more.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {[...applicationSteps, ...processFlowNotes].map((item, index) => (
            <article
              key={'slug' in item ? item.slug : item.title}
              className={
                'slug' in item
                  ? 'rounded-[1.65rem] border border-[var(--border)] bg-[color:var(--surface)/0.94] p-5 shadow-lg shadow-[color:var(--shadow-soft)]'
                  : 'rounded-[1.65rem] border border-[var(--accent)] bg-[var(--surface-spot)] p-5 shadow-lg shadow-[color:var(--shadow-soft)]'
              }
            >
              {'slug' in item ? (
                <div className="flex items-start gap-4">
                  <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] font-semibold text-[var(--brand)] shadow-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                      {item.label}
                    </p>
                    <h3 className="mt-1.5 font-display text-[1.9rem] text-[var(--foreground)]">
                      {item.title}
                    </h3>
                    <p className="mt-2.5 text-base leading-8 text-[var(--muted-foreground)]">
                      {item.description}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--accent-ink)]">
                    {item.title}
                  </p>
                  <p className="mt-3 text-base leading-7 text-[var(--foreground)]">
                    {item.copy}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section
        id="trust"
        data-scroll-section="true"
        className="site-shell py-7 lg:py-10"
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="rounded-[1.85rem] border border-[var(--border)] bg-[color:var(--surface)/0.92] p-6 shadow-xl shadow-[color:var(--shadow-soft)]">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
              Trust and clarity
            </p>
            <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--foreground)] lg:text-5xl">
              Explain the path before asking for sensitive details.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[var(--muted-foreground)]">
              The better lending experiences make support, timing, and privacy
              cues obvious up front. Banking and signing should feel earned, not
              abrupt.
            </p>
            <Alert
              variant="muted"
              className="mt-5 rounded-[1.4rem] border-[var(--border)] bg-[var(--surface-strong)]"
            >
              <AlertTitle className="text-[var(--foreground)]">
                The trust moment is usually banking
              </AlertTitle>
              <AlertDescription className="text-[var(--muted-foreground)]">
                The shell should already have answered support, disclosure, and
                timing questions before account details appear.
              </AlertDescription>
            </Alert>
          </div>

          <div className="grid gap-4 self-start">
            {trustChecklist.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  key={item.title}
                  className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[var(--border)] bg-[var(--surface)] text-[var(--brand)] shadow-sm">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-medium text-[var(--foreground)]">
                        {item.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">
                        {item.copy}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="faq"
        data-scroll-section="true"
        className="site-shell py-8 lg:py-12"
      >
        <div className="rounded-[2rem] border border-[var(--border)] bg-[color:var(--surface)/0.95] p-6 shadow-xl shadow-[color:var(--shadow-soft)] lg:p-7">
          <div className="grid gap-7 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Before the long part
              </p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--foreground)] lg:text-5xl">
                Answer the practical questions early.
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
                Strong lending pages front-load support, timing, and disclosure
                cues so customers know what the application is asking and when.
              </p>
            </div>

            <Accordion>
              {[
                [
                  'Where do disclosures live?',
                  'Up front, before income and bank details.',
                ],
                [
                  'Can someone pause mid-flow?',
                  'Yes. The secure application session keeps the current flow moving while the customer stays signed in.',
                ],
                [
                  'When does funding come up?',
                  'After review, documents, and signing, not as a buried last-minute detail.',
                ],
              ].map(([question, answer]) => (
                <AccordionItem
                  key={question}
                  className="rounded-[1.45rem] border-[var(--border)] bg-[var(--surface-strong)]"
                >
                  <AccordionTrigger className="px-4 py-4 text-[var(--foreground)]">
                    {question}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 text-base leading-8 text-[var(--muted-foreground)]">
                    {answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </main>
  );
}
