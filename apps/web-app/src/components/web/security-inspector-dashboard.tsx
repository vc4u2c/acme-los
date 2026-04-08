'use client';

import * as React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme-los/ui-web';
import { SiteHeader } from './site-header';

type SecurityInspectorServerSnapshot = {
  provider: 'mock' | 'okta';
  stateStoreMode: 'file' | 'redis';
  configurationError?: string;
  generatedAt: string;
  requestCookies: BrowserStorageEntry[];
  decodedCookies: {
    authSession: { sessionId: string } | null;
    authTransaction: {
      state: string;
      nonce: string;
      codeVerifier: string;
      returnTo: string;
      minimumAssuranceLevel: 'aal1' | 'aal2';
      leadId?: string;
      expiresAt: number;
    } | null;
  };
  storedSession: {
    sessionId: string;
    createdAt: number;
    expiresAt: number;
    session: Record<string, unknown>;
    tokens: {
      idToken: {
        raw: string | null;
        claims: Record<string, unknown> | null;
      };
      accessToken: {
        raw: string | null;
        claims: Record<string, unknown> | null;
      };
      refreshToken: string | null;
      tokenType?: string;
      scope?: string;
      expiresIn?: number;
    };
  } | null;
};

type BrowserStorageEntry = {
  key: string;
  value: string;
};

type BrowserSecuritySnapshot = {
  cookies: BrowserStorageEntry[];
  localStorage: BrowserStorageEntry[];
  sessionStorage: BrowserStorageEntry[];
};

const navigationItems: { href: string; label: string }[] = [];

function parseCookieString(cookieValue: string): BrowserStorageEntry[] {
  if (!cookieValue.trim()) {
    return [];
  }

  return cookieValue
    .split(/;\s*/)
    .map((item) => {
      const separatorIndex = item.indexOf('=');
      if (separatorIndex < 0) {
        return { key: item, value: '' };
      }

      return {
        key: item.slice(0, separatorIndex),
        value: item.slice(separatorIndex + 1),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function readStorageEntries(storage: Storage): BrowserStorageEntry[] {
  return Array.from({ length: storage.length })
    .map((_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key))
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({
      key,
      value: storage.getItem(key) ?? '',
    }));
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

function formatTimestamp(value: string | number): string {
  const asDate =
    typeof value === 'number' ? new Date(value) : new Date(String(value));

  return Number.isNaN(asDate.valueOf())
    ? String(value)
    : asDate.toLocaleString();
}

function DetailList(props: {
  title: string;
  description: string;
  entries: BrowserStorageEntry[];
  emptyMessage: string;
}): React.ReactElement {
  return (
    <Card className="rounded-[1.4rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm shadow-[color:var(--shadow-soft)]">
      <CardHeader className="px-5 py-5">
        <CardTitle className="text-lg">{props.title}</CardTitle>
        <CardDescription className="text-sm leading-7 text-[var(--muted-foreground)]">
          {props.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {props.entries.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {props.emptyMessage}
          </p>
        ) : (
          <div className="space-y-3">
            {props.entries.map((entry) => (
              <div
                key={`${props.title}-${entry.key}`}
                className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                  {entry.key}
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
                  {formatValue(entry.value)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TokenCard(props: {
  title: string;
  description: string;
  token: string | null;
  claims?: Record<string, unknown> | null;
}): React.ReactElement {
  return (
    <Card className="rounded-[1.4rem] border-[var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm shadow-[color:var(--shadow-soft)]">
      <CardHeader className="px-5 py-5">
        <CardTitle className="text-lg">{props.title}</CardTitle>
        <CardDescription className="text-sm leading-7 text-[var(--muted-foreground)]">
          {props.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Raw token
          </p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
            {props.token ?? 'Not present.'}
          </pre>
        </div>
        <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Decoded payload
          </p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
            {props.claims
              ? JSON.stringify(props.claims, null, 2)
              : 'Not available.'}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export function SecurityInspectorDashboard(): React.ReactElement {
  const [serverSnapshot, setServerSnapshot] =
    React.useState<SecurityInspectorServerSnapshot | null>(null);
  const [browserSnapshot, setBrowserSnapshot] =
    React.useState<BrowserSecuritySnapshot | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const abortController = new AbortController();

    async function loadInspectorState() {
      try {
        const response = await fetch('/api/security/inspector', {
          cache: 'no-store',
          signal: abortController.signal,
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;

          throw new Error(
            body?.message || 'Unable to load the security inspector.',
          );
        }

        const serverData =
          (await response.json()) as SecurityInspectorServerSnapshot;

        if (abortController.signal.aborted) {
          return;
        }

        setServerSnapshot(serverData);
        setBrowserSnapshot({
          cookies: parseCookieString(document.cookie),
          localStorage: readStorageEntries(window.localStorage),
          sessionStorage: readStorageEntries(window.sessionStorage),
        });
        setErrorMessage(null);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load the security inspector.',
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadInspectorState();

    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <main className="min-h-screen text-[var(--foreground)]">
      <SiteHeader items={navigationItems} variant="application" />

      <section className="site-shell py-6 sm:py-8 lg:py-10">
        <div className="space-y-5">
          <Card className="rounded-[1.7rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-2xl shadow-[color:var(--shadow-soft)]">
            <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-accent)] px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[var(--brand)]">
                Security demo
              </p>
              <CardTitle className="font-display text-[2rem] leading-tight text-[var(--foreground)] sm:text-[2.35rem] lg:text-4xl">
                Server auth state and browser storage.
              </CardTitle>
              <CardDescription className="max-w-4xl text-sm leading-7 text-[var(--muted-foreground)] sm:text-base sm:leading-8">
                This page is intentionally for demo and inspection use only. It
                shows the current server-side token/session state alongside the
                browser-visible cookie and storage state so we can explain the
                hardened auth boundary clearly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              <Alert className="rounded-[1.4rem] border-[var(--accent)] bg-[var(--surface-spot)]">
                <AlertTitle>Current hardening posture</AlertTitle>
                <AlertDescription className="space-y-2 text-[var(--foreground)]">
                  <p>
                    Stronger now: server-side PKCE start, server-side callback
                    exchange, opaque auth session cookie, and tokens off the
                    browser in the normal flow.
                  </p>
                  <p>
                    Still temporary: this inspector page itself, the in-memory
                    session store, and the remaining cookie-backed customer and
                    application demo state.
                  </p>
                </AlertDescription>
              </Alert>

              {isLoading ? (
                <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  Loading the security inspector.
                </div>
              ) : null}

              {errorMessage ? (
                <Alert className="rounded-[1.4rem] border-destructive bg-[color:var(--surface-strong)]">
                  <AlertTitle>Security inspector unavailable</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          {serverSnapshot ? (
            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <Card className="rounded-[1.4rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-sm shadow-[color:var(--shadow-soft)]">
                  <CardHeader className="px-5 py-5">
                    <CardTitle>Server session view</CardTitle>
                    <CardDescription className="text-sm leading-7 text-[var(--muted-foreground)]">
                      Generated at {formatTimestamp(serverSnapshot.generatedAt)}
                      . The server currently uses provider{' '}
                      {serverSnapshot.provider} and the{' '}
                      {serverSnapshot.stateStoreMode} state store.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5">
                    <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                        Stored auth session
                      </p>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
                        {JSON.stringify(serverSnapshot.storedSession, null, 2)}
                      </pre>
                    </div>
                    <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                        Decoded auth cookies
                      </p>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
                        {JSON.stringify(serverSnapshot.decodedCookies, null, 2)}
                      </pre>
                    </div>
                    {serverSnapshot.configurationError ? (
                      <Alert className="rounded-[1.2rem] border-[var(--accent)] bg-[var(--surface-spot)]">
                        <AlertTitle>Configuration note</AlertTitle>
                        <AlertDescription>
                          {serverSnapshot.configurationError}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="grid gap-5 lg:grid-cols-2">
                  <TokenCard
                    title="Server ID token"
                    description="Persisted in the server-side session store for logout hinting and demo inspection."
                    token={
                      serverSnapshot.storedSession?.tokens.idToken.raw ?? null
                    }
                    claims={
                      serverSnapshot.storedSession?.tokens.idToken.claims ??
                      null
                    }
                  />
                  <TokenCard
                    title="Server access token"
                    description="Captured during the server-side code exchange. This should not be reachable from browser storage."
                    token={
                      serverSnapshot.storedSession?.tokens.accessToken.raw ??
                      null
                    }
                    claims={
                      serverSnapshot.storedSession?.tokens.accessToken.claims ??
                      null
                    }
                  />
                </div>

                <Card className="rounded-[1.4rem] border-[var(--border)] bg-[color:var(--surface)/0.96] text-[var(--foreground)] shadow-sm shadow-[color:var(--shadow-soft)]">
                  <CardHeader className="px-5 py-5">
                    <CardTitle>Server refresh token and metadata</CardTitle>
                    <CardDescription className="text-sm leading-7 text-[var(--muted-foreground)]">
                      This shows what the server kept from the Okta token
                      exchange. Refresh token presence depends on the IdP flow
                      and app configuration.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5">
                    <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                        Refresh token
                      </p>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
                        {serverSnapshot.storedSession?.tokens.refreshToken ??
                          'Not present.'}
                      </pre>
                    </div>
                    <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                        Token metadata
                      </p>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-[var(--foreground)]">
                        {JSON.stringify(
                          {
                            tokenType:
                              serverSnapshot.storedSession?.tokens.tokenType,
                            scope: serverSnapshot.storedSession?.tokens.scope,
                            expiresIn:
                              serverSnapshot.storedSession?.tokens.expiresIn,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-5">
                <DetailList
                  title="Request cookies seen by the server"
                  description="This includes HttpOnly cookies because the browser sent them to the server with the request."
                  entries={serverSnapshot.requestCookies}
                  emptyMessage="No cookies were sent with the request."
                />

                <DetailList
                  title="Browser-visible cookies"
                  description="This is document.cookie from the browser. HttpOnly cookies do not appear here."
                  entries={browserSnapshot?.cookies ?? []}
                  emptyMessage="No browser-visible cookies were found."
                />

                <DetailList
                  title="Local storage"
                  description="Every localStorage key visible to the browser on this origin."
                  entries={browserSnapshot?.localStorage ?? []}
                  emptyMessage="Local storage is empty."
                />

                <DetailList
                  title="Session storage"
                  description="Every sessionStorage key visible to the browser on this origin."
                  entries={browserSnapshot?.sessionStorage ?? []}
                  emptyMessage="Session storage is empty."
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
