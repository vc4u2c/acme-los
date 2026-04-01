import { randomUUID } from 'node:crypto';
import type {
  ApplicationFlowSummary,
  ApplicationStepState,
  ApplicationStepKey,
  SaveApplicationStepRequest,
  SaveApplicationStepResponse,
  SubmitApplicationRequest,
  SubmitApplicationResponse,
  WebAuthSession,
} from '@acme-los/api/contracts';
import { applicationStepKeys } from '@acme-los/api/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { APPLICATION_FLOW_COOKIE_NAME, clearCookie } from './cookies';
import {
  deleteStateValue,
  readStateValue,
  writeStateValue,
} from './state-store';

type ApplicationFlowState = {
  flowId: string;
  userId: string;
  formState: Record<string, unknown>;
  summary: ApplicationFlowSummary;
  submittedAt?: string;
  expiresAt: number;
};

const APPLICATION_FLOW_TTL_SECONDS = 60 * 60 * 8;
const APPLICATION_FLOW_NAMESPACE = 'application-flow';

function getCurrentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getApplicationFlowKey(session: WebAuthSession): string | null {
  return session.user?.id ?? null;
}

function buildApplicationFlowSummary(
  session: WebAuthSession,
  currentStep: ApplicationStepKey,
): ApplicationFlowSummary {
  return {
    applicationId: randomUUID(),
    customerId: session.user?.customerId,
    leadId: session.user?.leadId,
    currentStep,
    completedSteps: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function getCompletedSteps(
  existingSteps: ApplicationStepKey[],
  step: ApplicationStepKey,
): ApplicationStepKey[] {
  const completedSteps = new Set<ApplicationStepKey>([...existingSteps, step]);

  return applicationStepKeys.filter((candidate) =>
    completedSteps.has(candidate),
  );
}

async function getFlowState(
  session: WebAuthSession,
): Promise<ApplicationFlowState | null> {
  const applicationFlowKey = getApplicationFlowKey(session);
  if (!applicationFlowKey) {
    return null;
  }

  const state = await readStateValue<ApplicationFlowState>(
    APPLICATION_FLOW_NAMESPACE,
    applicationFlowKey,
  );
  if (!state) {
    return null;
  }

  if (state.expiresAt <= getCurrentEpochSeconds()) {
    await deleteStateValue(APPLICATION_FLOW_NAMESPACE, applicationFlowKey);
    return null;
  }

  if (state.userId !== session.user?.id) {
    return null;
  }

  return state;
}

function toApplicationStepState(
  state: ApplicationFlowState,
  step: ApplicationStepKey,
): ApplicationStepState {
  return {
    step,
    payload: state.formState,
    summary: state.summary,
  };
}

async function upsertApplicationFlow(
  session: WebAuthSession,
  step: ApplicationStepKey,
  payload: Record<string, unknown>,
): Promise<ApplicationFlowState> {
  const existingState = await getFlowState(session);
  const baseState =
    existingState ??
    ({
      flowId: randomUUID(),
      userId: session.user?.id ?? 'anonymous',
      formState: {},
      summary: buildApplicationFlowSummary(session, step),
      expiresAt: getCurrentEpochSeconds() + APPLICATION_FLOW_TTL_SECONDS,
    } satisfies ApplicationFlowState);

  const nextState: ApplicationFlowState = {
    ...baseState,
    formState: {
      ...baseState.formState,
      ...payload,
    },
    summary: {
      ...baseState.summary,
      customerId: session.user?.customerId ?? baseState.summary.customerId,
      leadId: session.user?.leadId ?? baseState.summary.leadId,
      currentStep: step,
      completedSteps: getCompletedSteps(baseState.summary.completedSteps, step),
      lastUpdatedAt: new Date().toISOString(),
    },
    expiresAt: getCurrentEpochSeconds() + APPLICATION_FLOW_TTL_SECONDS,
  };

  const applicationFlowKey = getApplicationFlowKey(session);
  if (!applicationFlowKey) {
    return nextState;
  }

  await writeStateValue(
    APPLICATION_FLOW_NAMESPACE,
    applicationFlowKey,
    nextState,
    APPLICATION_FLOW_TTL_SECONDS,
  );

  return nextState;
}

export async function readApplicationStepState(
  session: WebAuthSession,
  step: ApplicationStepKey,
): Promise<ApplicationStepState | null> {
  const state = await getFlowState(session);
  if (!state) {
    return null;
  }

  return toApplicationStepState(state, step);
}

export async function readServerApplicationStepState(
  session: WebAuthSession,
  step: ApplicationStepKey,
): Promise<ApplicationStepState | null> {
  return readApplicationStepState(session, step);
}

export async function saveApplicationStep(
  session: WebAuthSession,
  step: ApplicationStepKey,
  payload: SaveApplicationStepRequest,
): Promise<SaveApplicationStepResponse> {
  const nextState = await upsertApplicationFlow(session, step, payload.payload);

  return {
    stepState: toApplicationStepState(nextState, step),
  };
}

export async function submitApplicationFlow(
  session: WebAuthSession,
  payload: SubmitApplicationRequest,
): Promise<SubmitApplicationResponse> {
  const nextState = await upsertApplicationFlow(
    session,
    payload.step,
    payload.payload ?? {},
  );
  const submittedAt = new Date().toISOString();
  const applicationFlowKey = getApplicationFlowKey(session);

  if (applicationFlowKey) {
    await deleteStateValue(APPLICATION_FLOW_NAMESPACE, applicationFlowKey);
  }

  return {
    summary: {
      ...nextState.summary,
      currentStep: payload.step,
      lastUpdatedAt: submittedAt,
    },
    submittedAt,
  };
}

export async function clearApplicationFlow(
  session: WebAuthSession,
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const applicationFlowKey = getApplicationFlowKey(session);
  if (applicationFlowKey) {
    await deleteStateValue(APPLICATION_FLOW_NAMESPACE, applicationFlowKey);
  }

  clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
}
