import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { SiteHeader } from '../components/web/site-header';
import { applicationSteps } from '../components/web/apply/step-definitions';
import {
  PreapprovalFeatureCard,
  preapprovalGraphics,
} from '../components/web/preapproval-graphics';

export const dynamic = 'force-static';

const navigationItems = [
  { href: '#why-us', label: 'Why us' },
  { href: '#preapproval', label: 'Preapproval' },
  { href: '#process', label: 'Process' },
  { href: '#trust', label: 'Trust' },
  { href: '#faq', label: 'FAQ' },
];

export default function Index() {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />

      <section className="site-shell py-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.06fr_0.94fr] lg:items-start xl:gap-10">
          <div className="space-y-8">
            <div className="space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Calm, clear, conversion-ready
              </p>
              <h1 className="max-w-5xl font-display text-4xl leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
                A steadier installment application from first answer to funding.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-[var(--muted-foreground)]">
                Lead with identity and disclosures, keep support in view, and
                move through income, banking, pre-approval, signing, and funding
                with fewer surprises late in the journey.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[var(--brand)] px-7 text-[var(--brand-contrast)] shadow-lg shadow-[color:var(--brand-shadow)] hover:bg-[var(--brand-strong)]"
              >
                <Link href="/apply/personal-info">Start application</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-accent)]"
              >
                <Link href="/showcase">See the experience library</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [
                  'Talk to us',
                  'Customer support and rate details stay visible throughout the experience.',
                ],
                [
                  'Pause when needed',
                  'Local draft progress stays in this browser while the customer steps away.',
                ],
                [
                  'See the path',
                  'Seven clear stages carry the customer from first answer to funding.',
                ],
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="rounded-[1.45rem] border border-[var(--border)] bg-[color:var(--surface)/0.9] p-4 shadow-lg shadow-[color:var(--shadow-soft)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
                    {title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)]">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                Application preview
              </p>
              <CardTitle className="font-display text-3xl">
                Customers see the path before they share sensitive information.
              </CardTitle>
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                The opening view sets expectations, shows the sequence, and
                makes the next click feel safe instead of rushed.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 p-5 sm:p-6">
              {applicationSteps.slice(0, 4).map((step, index) => (
                <div
                  key={step.slug}
                  className="flex items-start gap-4 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3.5"
                >
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-semibold text-[var(--brand-contrast)]">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">
                      {step.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
              <div className="rounded-[1.55rem] border border-[var(--accent)] bg-[var(--surface-spot)] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--accent-ink)]">
                  Timing and handoff
                </p>
                <p className="mt-3 text-base leading-7 text-[var(--foreground)]">
                  Banking, signing, and funding arrive in sequence, with the
                  next checkpoint visible before the form asks for more.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="preapproval" className="site-shell py-6 lg:py-8">
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

      <section id="why-us" className="site-shell py-7 lg:py-10">
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
              {[
                [
                  'Support is one click away',
                  'Phone, contact, and rate details stay inside the shell.',
                ],
                [
                  'Disclosures show up earlier',
                  'The customer understands consent and timing before banking details.',
                ],
                [
                  'Progress stays visible',
                  'Every stage feels like forward motion, not a reset.',
                ],
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-strong)] p-4"
                >
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <div className="grid gap-4 self-start">
            {[
              {
                title: 'Timing is explained up front',
                copy: 'The flow makes room for the questions people actually ask: when funds land, when disclosures appear, and what happens after review.',
              },
              {
                title: 'Completion feels more realistic',
                copy: 'Route-based steps, local drafts, and guided validation help customers finish without making the experience feel rushed.',
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-[1.7rem] border border-[var(--border)] bg-[color:var(--surface)/0.92] p-5 shadow-lg shadow-[color:var(--shadow-soft)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--brand)]">
                  Why us
                </p>
                <h3 className="mt-3 font-display text-3xl text-[var(--foreground)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-8 text-[var(--muted-foreground)]">
                  {item.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="site-shell py-7 lg:py-10">
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
          {applicationSteps.map((step, index) => (
            <article
              key={step.slug}
              className="rounded-[1.65rem] border border-[var(--border)] bg-[color:var(--surface)/0.94] p-5 shadow-lg shadow-[color:var(--shadow-soft)]"
            >
              <div className="flex items-start gap-4">
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] font-semibold text-[var(--brand)] shadow-sm">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                    {step.label}
                  </p>
                  <h3 className="mt-1.5 font-display text-[1.9rem] text-[var(--foreground)]">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-base leading-8 text-[var(--muted-foreground)]">
                    {step.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className="site-shell py-7 lg:py-10">
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
            {[
              'Contact and address before bank account details',
              'Disclosures before soft-review consent',
              'Funding expectations surfaced before final submission',
            ].map((item) => (
              <div
                key={item}
                className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-4 text-base font-medium text-[var(--foreground)] shadow-sm"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="site-shell py-8 lg:py-12">
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
                  'Yes. Draft progress stays saved in this browser.',
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
