import { Card, CardContent, CardHeader, CardTitle } from '@acme-los/ui-web';
import { SiteHeader } from './site-header';

type ContentSection = {
  title: string;
  body: string;
};

const navigationItems = [
  { href: '/', label: 'Home' },
  { href: '/apply/personal-info', label: 'Application' },
];

export function ContentPageShell({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: ContentSection[];
}): React.ReactElement {
  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} />
      <section className="site-shell py-10 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-display text-5xl leading-tight text-[var(--foreground)]">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--muted-foreground)]">
            {intro}
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {sections.map((section) => (
            <Card
              key={section.title}
              className="rounded-[1.9rem] border-[var(--border)] bg-[color:var(--surface)/0.95] text-[var(--foreground)] shadow-xl shadow-[color:var(--shadow-soft)]"
            >
              <CardHeader>
                <CardTitle className="font-display text-3xl text-[var(--foreground)]">
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-base leading-8 text-[var(--muted-foreground)]">
                  {section.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
