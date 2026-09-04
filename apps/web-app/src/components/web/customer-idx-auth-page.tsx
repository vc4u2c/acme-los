'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  IdxTransaction,
  Input as IdxInput,
  NextStep,
} from '@okta/okta-auth-js';
import { IdxStatus } from '@okta/okta-auth-js';
import { createWebApiClient } from '@acme-los/api/web-client';
import type {
  StartIdxAuthFlowResponse,
  WebAuthStepUpReason,
} from '@acme-los/api/contracts';
import { createIdxAuthClient, getStoredLeadId } from '@acme-los/auth/web';
import { Button, Checkbox, Input } from '@acme-los/ui-web';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Mail,
  RotateCcw,
  ShieldCheck,
  ShieldQuestion,
  Smartphone,
} from 'lucide-react';
import type { OktaAuth } from '@okta/okta-auth-js';
import {
  filterAuthenticatorOptions,
  getIdxJourneyContent,
  isRememberPreferenceInput,
  selectInitialIdxStep,
  shouldAutoAdvanceInitialIdxStep,
  type IdxJourneyFlow,
} from '../../lib/idx-experience';
import { buildIdxJourneyUrl } from '../../lib/idx-journey-routes';
import { CustomerAuthFooter } from './customer-auth-footer';
import { CustomerAuthHeader } from './customer-auth-header';

type FormValue = string | boolean;

type CustomerIdxAuthPageProps = {
  returnTo: string;
  minimumAssuranceLevel: 'aal1' | 'aal2';
  flow: IdxJourneyFlow;
  errorMessage?: string;
  postChange?: boolean;
};

const authenticatorContent = {
  okta_email: {
    label: 'Email a code',
    description: 'Send a one-time code to your verified email.',
    icon: Mail,
  },
  phone_number: {
    label: 'Text a code',
    description: 'Send a one-time code to your verified mobile phone.',
    icon: Smartphone,
  },
  okta_password: {
    label: 'Use password',
    description: 'Verify with your current account password.',
    icon: KeyRound,
  },
  security_question: {
    label: 'Answer security question',
    description: 'Verify with your enrolled security question.',
    icon: ShieldQuestion,
  },
} as const;

function getAuthenticatorKey(step?: NextStep | null): string | undefined {
  return step?.authenticator?.key ?? step?.relatesTo?.value.key;
}

function getStepTitle(step?: NextStep | null): string {
  if (!step) {
    return 'Preparing sign in';
  }

  const authenticatorKey = getAuthenticatorKey(step);

  if (step.name === 'identify' || step.name === 'identify-recovery') {
    return step.inputs?.some((input) => input.name === 'password')
      ? 'Enter your email and password'
      : 'Enter your email';
  }

  if (step.name.startsWith('select-authenticator')) {
    return 'Choose how to verify';
  }

  if (authenticatorKey === 'okta_password') {
    return step.name.includes('enroll') || step.name === 'reset-authenticator'
      ? 'Create a password'
      : 'Enter your password';
  }

  if (authenticatorKey === 'okta_email') {
    return 'Check your email';
  }

  if (authenticatorKey === 'phone_number') {
    return step.inputs?.some((input) => input.name === 'phoneNumber')
      ? 'Add your mobile phone'
      : 'Check your phone';
  }

  if (authenticatorKey === 'security_question') {
    if (step.name.includes('enroll')) {
      return 'Set up a security question';
    }

    return (
      step.authenticator?.contextualData?.enrolledQuestion?.question ??
      'Answer your security question'
    );
  }

  if (step.name === 'enroll-profile') {
    return 'Tell us about yourself';
  }

  if (step.name === 'reset-authenticator') {
    return 'Choose a new password';
  }

  if (step.name.includes('enroll')) {
    return 'Set up verification';
  }

  return 'Continue verification';
}

function getStepDescription(step?: NextStep | null): string | null {
  const authenticatorKey = getAuthenticatorKey(step);
  const inputNames = new Set(step?.inputs?.map((input) => input.name) ?? []);

  if (authenticatorKey === 'okta_email') {
    return inputNames.has('verificationCode')
      ? 'Enter the code from the email Okta sent. Request another only if the first code did not arrive.'
      : 'Continue when you are ready to receive an email verification code.';
  }

  if (authenticatorKey === 'phone_number') {
    return inputNames.has('phoneNumber')
      ? 'Enter your US mobile number. Okta sends the text only after you continue.'
      : inputNames.has('verificationCode')
        ? 'Enter the code from the text message Okta sent.'
        : 'Continue when you are ready to receive a text-message code.';
  }

  if (authenticatorKey === 'okta_password') {
    return step?.name.includes('enroll') || step?.name === 'reset-authenticator'
      ? 'Choose a password that meets the account security requirements.'
      : 'Enter your current account password.';
  }

  if (authenticatorKey === 'security_question') {
    return step?.name.includes('enroll')
      ? 'Choose a question and enter an answer you can use during account recovery.'
      : 'Enter the answer associated with your account.';
  }

  return null;
}

function getInputLabel(input: IdxInput): string {
  const labels: Record<string, string> = {
    identifier: 'Email',
    username: 'Email',
    password: 'Password',
    verificationCode: 'Verification code',
    answer: 'Security answer',
    questionKey: 'Security question',
    question: 'Custom security question',
    methodType: 'Delivery method',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phoneNumber: 'Mobile phone',
    acmeState: 'State',
  };

  return labels[input.name] ?? input.label ?? input.name;
}

function getInputType(input: IdxInput): React.HTMLInputTypeAttribute {
  if (
    input.secret ||
    input.name === 'password' ||
    input.name.toLowerCase().includes('password') ||
    input.name === 'answer'
  ) {
    return 'password';
  }

  if (input.name.toLowerCase().includes('email')) {
    return 'email';
  }

  if (input.name.toLowerCase().includes('phone')) {
    return 'tel';
  }

  return 'text';
}

function getAutoComplete(input: IdxInput): string {
  if (input.name === 'identifier' || input.name === 'username') {
    return 'username';
  }

  if (input.name === 'password') {
    return 'current-password';
  }

  if (input.name.toLowerCase().includes('newpassword')) {
    return 'new-password';
  }

  if (input.name === 'verificationCode') {
    return 'one-time-code';
  }

  if (input.name.toLowerCase().includes('email')) {
    return 'email';
  }

  if (input.name.toLowerCase().includes('phone')) {
    return 'tel';
  }

  return 'off';
}

function getSubmitLabel(step?: NextStep | null): string {
  if (!step) {
    return 'Continue';
  }

  if (step.name === 'identify' || step.name === 'identify-recovery') {
    return 'Continue';
  }

  const authenticatorKey = getAuthenticatorKey(step);
  const inputNames = new Set(step.inputs?.map((input) => input.name) ?? []);

  if (authenticatorKey === 'okta_password') {
    return step.name.includes('enroll') || step.name === 'reset-authenticator'
      ? 'Save password'
      : 'Verify password';
  }

  if (inputNames.has('verificationCode')) {
    return 'Verify code';
  }

  if (authenticatorKey === 'okta_email') {
    return 'Send email code';
  }

  if (authenticatorKey === 'phone_number') {
    return 'Send text code';
  }

  if (authenticatorKey === 'security_question') {
    return step.name.includes('enroll')
      ? 'Save security question'
      : 'Verify answer';
  }

  if (step.name === 'enroll-profile') {
    return 'Create account';
  }

  return 'Continue';
}

function getFriendlyIdxError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('already exists') ||
    normalized.includes('already registered')
  ) {
    return 'An account with this email already exists. Sign in or use another email.';
  }

  if (normalized.includes('locked')) {
    return 'This account is locked. Use Unlock account to restore access.';
  }

  if (normalized.includes('expired') || normalized.includes('state handle')) {
    return 'Your secure sign-in session expired. Start again.';
  }

  if (
    normalized.includes('verification code') ||
    normalized.includes('passcode') ||
    normalized.includes('one-time code')
  ) {
    return 'That verification code is not valid. Check the code and try again.';
  }

  if (
    normalized.includes('credential') ||
    normalized.includes('password is incorrect')
  ) {
    return 'The email or password is incorrect. Check both values and try again.';
  }

  if (
    normalized.includes('password') &&
    (normalized.includes('requirement') ||
      normalized.includes('complexity') ||
      normalized.includes('history'))
  ) {
    return 'That password does not meet the account security requirements.';
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('network') ||
    normalized.includes('timeout')
  ) {
    return 'Secure sign in is temporarily unavailable. Check your connection and try again.';
  }

  return fallback;
}

function getFlowIdentifier(flow: IdxJourneyFlow) {
  return flow === 'authenticate' ? 'default' : flow;
}

function getSignInHref(returnTo: string): string {
  return buildIdxJourneyUrl('authenticate', returnTo);
}

function getFlowHref(flow: IdxJourneyFlow, returnTo: string): string {
  return buildIdxJourneyUrl(flow, returnTo);
}

export function CustomerIdxAuthPage({
  returnTo,
  minimumAssuranceLevel,
  flow,
  errorMessage,
  postChange = false,
}: CustomerIdxAuthPageProps): React.ReactElement {
  const webApiClient = React.useMemo(() => createWebApiClient(), []);
  const oktaAuthRef = React.useRef<OktaAuth | null>(null);
  const startResponseRef = React.useRef<StartIdxAuthFlowResponse | null>(null);
  const startedRef = React.useRef(false);
  const [transaction, setTransaction] = React.useState<IdxTransaction | null>(
    null,
  );
  const [currentStep, setCurrentStep] = React.useState<NextStep | null>(null);
  const [formValues, setFormValues] = React.useState<Record<string, FormValue>>(
    {},
  );
  const [stepUpReason, setStepUpReason] =
    React.useState<WebAuthStepUpReason | null>(null);
  const [hasVerifiedPassword, setHasVerifiedPassword] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(true);
  const [clientError, setClientError] = React.useState<string | null>(
    errorMessage ?? null,
  );
  const [completedRecovery, setCompletedRecovery] = React.useState(false);

  const journeyContent = getIdxJourneyContent(flow, stepUpReason);
  const currentInputs = currentStep?.inputs ?? [];
  const authenticatorInput = currentInputs.find(
    (input) => input.name === 'authenticator' && input.options?.length,
  );
  const filteredAuthenticatorOptions = filterAuthenticatorOptions(
    authenticatorInput?.options ?? [],
    stepUpReason,
    hasVerifiedPassword,
  );
  const renderedInputs = currentInputs.filter(
    (input) =>
      input !== authenticatorInput &&
      input.visible !== false &&
      !isRememberPreferenceInput(input.name),
  );
  const transactionMessages = (transaction?.messages ?? []).filter(
    (message) => message.class === 'ERROR',
  );
  const transactionErrorMessage = transactionMessages[0]?.message
    ? getFriendlyIdxError(
        new Error(transactionMessages[0].message),
        'Check the information and try again.',
      )
    : null;

  const completeTransaction = React.useCallback(
    async (nextTransaction: IdxTransaction) => {
      const startedTransaction = startResponseRef.current;
      if (!nextTransaction.interactionCode || !startedTransaction) {
        throw new Error('Okta did not return a valid interaction code.');
      }

      const completion = await webApiClient.auth.completeIdx({
        interactionCode: nextTransaction.interactionCode,
        state: startedTransaction.state,
      });
      window.location.assign(completion.returnTo);
    },
    [webApiClient],
  );

  const applyTransaction = React.useCallback(
    async (initialTransaction: IdxTransaction) => {
      let nextTransaction = initialTransaction;

      for (let transitionCount = 0; transitionCount < 4; transitionCount += 1) {
        setTransaction(nextTransaction);

        if (
          nextTransaction.status === IdxStatus.SUCCESS &&
          nextTransaction.interactionCode
        ) {
          setCurrentStep(null);
          setIsBusy(true);
          await completeTransaction(nextTransaction);
          return;
        }

        if (nextTransaction.status === IdxStatus.TERMINAL) {
          const errorMessage = (nextTransaction.messages ?? []).find(
            (message) => message.class === 'ERROR',
          )?.message;

          setCurrentStep(null);
          if (!errorMessage && flow !== 'authenticate') {
            setCompletedRecovery(true);
          } else if (!errorMessage) {
            setClientError(
              'Okta ended this sign-in attempt. Please start again.',
            );
          } else {
            setClientError(
              getFriendlyIdxError(
                new Error(errorMessage),
                'Okta could not complete this verification. Check the information and try again.',
              ),
            );
          }
          setIsBusy(false);
          return;
        }

        if (
          nextTransaction.status === IdxStatus.FAILURE ||
          nextTransaction.status === IdxStatus.CANCELED
        ) {
          const errorMessage = (nextTransaction.messages ?? []).find(
            (message) => message.class === 'ERROR',
          )?.message;
          setCurrentStep(null);
          setClientError(
            getFriendlyIdxError(
              errorMessage ? new Error(errorMessage) : null,
              'Okta could not continue this verification attempt. Start again.',
            ),
          );
          setIsBusy(false);
          return;
        }

        const selectedStep =
          nextTransaction.nextStep ??
          selectInitialIdxStep(nextTransaction.availableSteps, flow);
        const isInitialStepModeResponse =
          !nextTransaction.nextStep && Boolean(nextTransaction.availableSteps);

        if (
          selectedStep &&
          isInitialStepModeResponse &&
          shouldAutoAdvanceInitialIdxStep(selectedStep)
        ) {
          if (!selectedStep.action) {
            throw new Error(
              `Okta did not provide an action for ${selectedStep.name}.`,
            );
          }

          nextTransaction = await selectedStep.action();
          continue;
        }

        setCurrentStep(selectedStep ?? null);
        if (!selectedStep) {
          setClientError(
            'Okta did not provide the next verification step. Start again or contact support.',
          );
        }
        setIsBusy(false);
        return;
      }

      throw new Error('Okta returned too many automatic verification steps.');
    },
    [completeTransaction, flow],
  );

  const startTransaction = React.useCallback(async () => {
    setIsBusy(true);
    setClientError(null);
    setCompletedRecovery(false);
    setHasVerifiedPassword(false);
    setCurrentStep(null);
    setTransaction(null);

    try {
      const response = await webApiClient.auth.startIdx({
        returnTo,
        minimumAssuranceLevel,
        leadId: getStoredLeadId() ?? undefined,
      });
      const oktaAuth = createIdxAuthClient(response);

      oktaAuthRef.current = oktaAuth;
      startResponseRef.current = response;
      setStepUpReason(response.stepUpReason);

      const nextTransaction = await oktaAuth.idx.start({
        flow: getFlowIdentifier(flow),
        state: response.state,
        nonce: response.nonce,
        codeChallenge: response.codeChallenge,
        codeChallengeMethod: response.codeChallengeMethod,
        acrValues: response.acrValues ?? undefined,
        maxAge: response.maxAgeSeconds ?? undefined,
        exchangeCodeForTokens: false,
        withCredentials: true,
      });

      await applyTransaction(nextTransaction);
    } catch (error) {
      setClientError(
        getFriendlyIdxError(
          error,
          'Unable to begin secure sign-in. Try again.',
        ),
      );
      setIsBusy(false);
    }
  }, [applyTransaction, flow, minimumAssuranceLevel, returnTo, webApiClient]);

  React.useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    void startTransaction();
  }, [startTransaction]);

  React.useEffect(() => {
    if (!currentStep) {
      return;
    }

    setFormValues((previousValues) => {
      return currentInputs.reduce<Record<string, FormValue>>(
        (nextValues, input) => {
          if (input.visible === false || input === authenticatorInput) {
            return nextValues;
          }

          if (input.type === 'boolean') {
            nextValues[input.name] =
              typeof previousValues[input.name] === 'boolean'
                ? previousValues[input.name]
                : false;
            return nextValues;
          }

          const previousValue = previousValues[input.name];
          nextValues[input.name] = input.secret
            ? ''
            : typeof previousValue === 'string'
              ? previousValue
              : typeof input.value === 'string'
                ? input.value
                : '';
          return nextValues;
        },
        {},
      );
    });
  }, [authenticatorInput, currentInputs, currentStep]);

  const proceed = React.useCallback(
    async (values: Record<string, FormValue>) => {
      const oktaAuth = oktaAuthRef.current;
      const step = currentStep;

      if (!oktaAuth || !step) {
        return;
      }

      setIsBusy(true);
      setClientError(null);

      try {
        const nextTransaction = await oktaAuth.idx.proceed({
          step: step.name,
          ...values,
        });

        const completedPasswordStep = step.inputs?.some(
          (input) => input.name === 'password',
        );
        const hasRemediationError = (nextTransaction.messages ?? []).some(
          (message) => message.class === 'ERROR',
        );

        if (
          completedPasswordStep &&
          !hasRemediationError &&
          nextTransaction.status !== IdxStatus.FAILURE &&
          nextTransaction.status !== IdxStatus.CANCELED
        ) {
          setHasVerifiedPassword(true);
        }

        await applyTransaction(nextTransaction);
      } catch (error) {
        setClientError(
          getFriendlyIdxError(
            error,
            'Unable to continue verification. Check the information and try again.',
          ),
        );
        setIsBusy(false);
      }
    },
    [applyTransaction, currentStep],
  );

  const proceedToStep = React.useCallback(
    async (stepName: string, values: Record<string, FormValue> = {}) => {
      const oktaAuth = oktaAuthRef.current;
      if (!oktaAuth) {
        return;
      }

      setIsBusy(true);
      setClientError(null);

      try {
        const nextTransaction = await oktaAuth.idx.proceed({
          step: stepName,
          ...values,
        });
        await applyTransaction(nextTransaction);
      } catch (error) {
        setClientError(
          getFriendlyIdxError(
            error,
            'Unable to continue verification. Please try again.',
          ),
        );
        setIsBusy(false);
      }
    },
    [applyTransaction],
  );

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void proceed(formValues);
    },
    [formValues, proceed],
  );

  const authenticatorBackStep = transaction?.availableSteps?.find(
    (step) =>
      step.name === 'select-authenticator-authenticate' ||
      step.name === 'select-authenticator-enroll',
  );
  const isPostChangeStepUp =
    stepUpReason === 'post-email-change' ||
    stepUpReason === 'post-phone-change' ||
    stepUpReason === 'post-password-change';
  const showFooterSignIn = flow !== 'authenticate';
  const securityQuestions =
    currentStep?.authenticator?.contextualData?.questions ?? [];
  const supportsCustomSecurityQuestion =
    currentStep?.authenticator?.contextualData?.questionKeys?.includes(
      'custom',
    ) ?? false;

  return (
    <>
      <CustomerAuthHeader
        action={
          flow !== 'authenticate'
            ? { href: getSignInHref(returnTo), label: 'Sign in' }
            : undefined
        }
      />
      <main className="min-h-[calc(100vh-10rem)] bg-[var(--background)] text-[var(--foreground)]">
        <section className="border-b border-[var(--border)]">
          <div className="site-shell grid gap-8 py-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(24rem,1.2fr)] lg:gap-16 lg:py-14">
            <div className="max-w-xl self-start lg:sticky lg:top-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
                {journeyContent.eyebrow}
              </p>
              <h1 className="mt-3 font-display text-3xl leading-tight text-[var(--foreground)] sm:text-4xl">
                {journeyContent.title}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-[var(--muted-foreground)]">
                {journeyContent.description}
              </p>

              <div className="mt-8 border-l-2 border-[var(--brand)] pl-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Protected by Okta
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Secure access for your application and account.
                </p>
              </div>
            </div>

            <div className="border-t border-[var(--border-strong)] pt-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
              <div className="mx-auto max-w-xl">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Identity verification
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
                      {completedRecovery
                        ? 'Verification complete'
                        : getStepTitle(currentStep)}
                    </h2>
                  </div>
                  <ShieldCheck
                    className="h-6 w-6 shrink-0 text-[var(--brand)]"
                    aria-hidden="true"
                  />
                </div>

                {getStepDescription(currentStep) && !completedRecovery ? (
                  <p className="mt-5 text-sm leading-6 text-[var(--muted-foreground)]">
                    {getStepDescription(currentStep)}
                  </p>
                ) : null}

                {clientError || transactionErrorMessage ? (
                  <div
                    className="mt-5 rounded-md border border-[color:var(--critical)/0.45] bg-[color:var(--critical)/0.08] px-4 py-3 text-sm text-[var(--critical)]"
                    role="alert"
                  >
                    {clientError ?? transactionErrorMessage}
                  </div>
                ) : null}

                {completedRecovery ? (
                  <div className="flex flex-wrap gap-3 py-8">
                    <CheckCircle2
                      className="h-8 w-8 text-[var(--brand)]"
                      aria-hidden="true"
                    />
                    <p className="mt-4 text-base leading-7 text-[var(--muted-foreground)]">
                      Your account security update is complete. Sign in to
                      continue your application.
                    </p>
                    <Button asChild className="mt-6 w-full sm:w-auto">
                      <Link href={getSignInHref(returnTo)}>
                        Sign in
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                ) : isBusy && !currentStep ? (
                  <div className="flex min-h-56 items-center justify-center py-10">
                    <div className="text-center" role="status">
                      <RotateCcw
                        className="mx-auto h-6 w-6 animate-spin text-[var(--brand)]"
                        aria-hidden="true"
                      />
                      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                        Preparing secure sign in...
                      </p>
                    </div>
                  </div>
                ) : authenticatorInput ? (
                  <div className="space-y-3 py-6">
                    {filteredAuthenticatorOptions.map((option) => {
                      const key =
                        option.relatesTo?.key ??
                        (typeof option.value === 'string' ? option.value : '');
                      const content =
                        authenticatorContent[
                          key as keyof typeof authenticatorContent
                        ];
                      const Icon = content?.icon ?? ShieldCheck;

                      return (
                        <button
                          key={`${key}-${option.label}`}
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void proceed({
                              authenticator: String(option.value),
                            })
                          }
                          className="flex w-full items-center gap-4 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-4 text-left transition-colors hover:border-[var(--brand)] hover:bg-[var(--surface-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--brand)]">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-[var(--foreground)]">
                              {content?.label ?? option.label}
                            </span>
                            <span className="mt-1 block text-sm leading-5 text-[var(--muted-foreground)]">
                              {content?.description ??
                                'Continue with this verification method.'}
                            </span>
                          </span>
                          <ArrowRight
                            className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}

                    {filteredAuthenticatorOptions.length === 0 ? (
                      <div
                        className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm leading-6 text-[var(--muted-foreground)]"
                        role="status"
                      >
                        The verification method required for this action is not
                        enrolled on your account. Contact support before trying
                        again.
                      </div>
                    ) : null}
                  </div>
                ) : currentStep ? (
                  <form className="space-y-5 py-6" onSubmit={handleSubmit}>
                    {renderedInputs.map((input) => {
                      const value = formValues[input.name];

                      if (
                        input.name === 'question' &&
                        formValues.questionKey !== 'custom'
                      ) {
                        return null;
                      }

                      if (
                        input.name === 'questionKey' &&
                        securityQuestions.length > 0
                      ) {
                        return (
                          <label
                            key={input.name}
                            className="block text-sm font-medium text-[var(--foreground)]"
                          >
                            {getInputLabel(input)}
                            <select
                              required
                              disabled={isBusy}
                              value={typeof value === 'string' ? value : ''}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  questionKey: event.target.value,
                                  question:
                                    event.target.value === 'custom'
                                      ? current.question
                                      : '',
                                }))
                              }
                              className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                            >
                              <option value="">Select a question</option>
                              {securityQuestions.map((question) => (
                                <option
                                  key={question.questionKey}
                                  value={question.questionKey}
                                >
                                  {question.question}
                                </option>
                              ))}
                              {supportsCustomSecurityQuestion ? (
                                <option value="custom">
                                  Create my own question
                                </option>
                              ) : null}
                            </select>
                          </label>
                        );
                      }

                      if (input.type === 'boolean') {
                        return (
                          <label
                            key={input.name}
                            className="flex items-start gap-3 text-sm text-[var(--foreground)]"
                          >
                            <Checkbox
                              checked={Boolean(value)}
                              disabled={isBusy}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  [input.name]: event.target.checked,
                                }))
                              }
                            />
                            <span>{getInputLabel(input)}</span>
                          </label>
                        );
                      }

                      if (input.options?.length) {
                        return (
                          <label
                            key={input.name}
                            className="block text-sm font-medium text-[var(--foreground)]"
                          >
                            {getInputLabel(input)}
                            <select
                              required={input.required}
                              disabled={isBusy}
                              value={typeof value === 'string' ? value : ''}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  [input.name]: event.target.value,
                                }))
                              }
                              className="mt-2 h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                            >
                              <option value="">Select an option</option>
                              {input.options.map((option) => (
                                <option
                                  key={`${input.name}-${option.label}`}
                                  value={String(option.value)}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      }

                      return (
                        <label
                          key={input.name}
                          className="block text-sm font-medium text-[var(--foreground)]"
                        >
                          {getInputLabel(input)}
                          <Input
                            className="mt-2 h-11"
                            type={getInputType(input)}
                            name={input.name}
                            required={input.required}
                            minLength={input.minLength}
                            maxLength={input.maxLength}
                            autoComplete={getAutoComplete(input)}
                            inputMode={
                              input.name === 'verificationCode'
                                ? 'numeric'
                                : undefined
                            }
                            disabled={isBusy}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                [input.name]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      );
                    })}

                    <Button type="submit" className="w-full" disabled={isBusy}>
                      {isBusy ? 'Verifying...' : getSubmitLabel(currentStep)}
                      {!isBusy ? (
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      ) : null}
                    </Button>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--border)] pt-4 text-sm">
                      {currentStep.canResend ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void proceed({ resend: true })}
                          className="font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline disabled:opacity-55"
                        >
                          Send another code
                        </button>
                      ) : null}
                      {authenticatorBackStep ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void proceedToStep(authenticatorBackStep.name)
                          }
                          className="inline-flex items-center gap-1.5 font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline disabled:opacity-55"
                        >
                          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                          Back to verification methods
                        </button>
                      ) : null}
                      {currentStep.canSkip ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void proceedToStep('skip')}
                          className="font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline disabled:opacity-55"
                        >
                          Do this later
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : (
                  <div className="py-8">
                    <Button
                      type="button"
                      onClick={() => void startTransaction()}
                      disabled={isBusy}
                    >
                      Start again
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}

                {!completedRecovery ? (
                  <nav
                    className="flex flex-wrap gap-x-5 gap-y-3 border-t border-[var(--border)] py-5 text-sm"
                    aria-label="Account access"
                  >
                    {flow === 'authenticate' &&
                    !postChange &&
                    !isPostChangeStepUp ? (
                      <>
                        <Link
                          href={getFlowHref('recoverPassword', returnTo)}
                          className="font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline"
                        >
                          Forgot password?
                        </Link>
                        <Link
                          href={getFlowHref('unlockAccount', returnTo)}
                          className="font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline"
                        >
                          Unlock account
                        </Link>
                        <Link
                          href={getFlowHref('register', returnTo)}
                          className="font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline"
                        >
                          Create account
                        </Link>
                      </>
                    ) : null}
                    {showFooterSignIn ? (
                      <Link
                        href={getSignInHref(returnTo)}
                        className="font-semibold text-[var(--brand-strong)] underline-offset-4 hover:underline"
                      >
                        Sign in
                      </Link>
                    ) : null}
                  </nav>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>
      <CustomerAuthFooter />
    </>
  );
}
