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
import { cookies } from 'next/headers';
import {
  APPLICATION_FLOW_COOKIE_NAME,
  clearCookie,
  parseSignedCookieValue,
  readSignedCookie,
  setSignedCookie,
} from './cookies';

type ApplicationFlowCookiePayload = {
  flowId: string;
};

type ApplicationFlowState = {
  flowId: string;
  userId: string;
  formState: Record<string, unknown>;
  summary: ApplicationFlowSummary;
  submittedAt?: string;
  expiresAt: number;
};

const APPLICATION_FLOW_TTL_SECONDS = 60 * 60 * 8;
const applicationFlowStore = new Map<string, ApplicationFlowState>();

function getCurrentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function pruneExpiredFlows(): void {
  const currentEpochSeconds = getCurrentEpochSeconds();

  for (const [flowId, state] of applicationFlowStore.entries()) {
    if (state.expiresAt <= currentEpochSeconds) {
      applicationFlowStore.delete(flowId);
    }
  }
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

function getFlowState(
  flowId: string,
  session: WebAuthSession,
): ApplicationFlowState | null {
  pruneExpiredFlows();
  const state = applicationFlowStore.get(flowId);
  if (!state) {
    return null;
  }

  if (state.expiresAt <= getCurrentEpochSeconds()) {
    applicationFlowStore.delete(flowId);
    return null;
  }

  if (state.userId !== session.user?.id) {
    return null;
  }

  return state;
}

function readFlowIdFromRequest(request: NextRequest): string | null {
  const cookiePayload = readSignedCookie<ApplicationFlowCookiePayload>(
    request,
    APPLICATION_FLOW_COOKIE_NAME,
  );

  return cookiePayload?.flowId ?? null;
}

function readFlowIdFromCookieValue(rawCookieValue?: string): string | null {
  const cookiePayload =
    parseSignedCookieValue<ApplicationFlowCookiePayload>(rawCookieValue);

  return cookiePayload?.flowId ?? null;
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

export function writeApplicationFlowCookie(
  request: NextRequest,
  response: NextResponse,
  flowId: string,
): void {
  setSignedCookie(response, request, APPLICATION_FLOW_COOKIE_NAME, {
    flowId,
  } satisfies ApplicationFlowCookiePayload);
}

function deleteFlow(flowId: string): void {
  applicationFlowStore.delete(flowId);
}

function upsertApplicationFlow(
  session: WebAuthSession,
  step: ApplicationStepKey,
  payload: Record<string, unknown>,
  existingState?: ApplicationFlowState | null,
): ApplicationFlowState {
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

  applicationFlowStore.set(nextState.flowId, nextState);
  return nextState;
}

export function readApplicationStepState(
  request: NextRequest,
  session: WebAuthSession,
  step: ApplicationStepKey,
): ApplicationStepState | null {
  const flowId = readFlowIdFromRequest(request);
  if (!flowId) {
    return null;
  }

  const state = getFlowState(flowId, session);
  if (!state) {
    return null;
  }

  return toApplicationStepState(state, step);
}

export async function readServerApplicationStepState(
  session: WebAuthSession,
  step: ApplicationStepKey,
): Promise<ApplicationStepState | null> {
  const cookieStore = await cookies();
  const flowId = readFlowIdFromCookieValue(
    cookieStore.get(APPLICATION_FLOW_COOKIE_NAME)?.value,
  );

  if (!flowId) {
    return null;
  }

  const state = getFlowState(flowId, session);
  if (!state) {
    return null;
  }

  return toApplicationStepState(state, step);
}

export function saveApplicationStep(
  session: WebAuthSession,
  step: ApplicationStepKey,
  payload: SaveApplicationStepRequest,
  request: NextRequest,
): SaveApplicationStepResponse & { flowId: string } {
  const existingFlowId = readFlowIdFromRequest(request);
  const existingState = existingFlowId
    ? getFlowState(existingFlowId, session)
    : null;
  const nextState = upsertApplicationFlow(
    session,
    step,
    payload.payload,
    existingState,
  );

  return {
    flowId: nextState.flowId,
    stepState: toApplicationStepState(nextState, step),
  };
}

export function submitApplicationFlow(
  session: WebAuthSession,
  payload: SubmitApplicationRequest,
  request: NextRequest,
): SubmitApplicationResponse {
  const existingFlowId = readFlowIdFromRequest(request);
  const existingState = existingFlowId
    ? getFlowState(existingFlowId, session)
    : null;
  const nextState = upsertApplicationFlow(
    session,
    payload.step,
    payload.payload ?? {},
    existingState,
  );
  const submittedAt = new Date().toISOString();

  deleteFlow(nextState.flowId);
  return {
    summary: {
      ...nextState.summary,
      currentStep: payload.step,
      lastUpdatedAt: submittedAt,
    },
    submittedAt,
  };
}

export function clearApplicationFlow(
  request: NextRequest,
  response: NextResponse,
): void {
  const flowId = readFlowIdFromRequest(request);
  if (flowId) {
    deleteFlow(flowId);
  }

  clearCookie(response, request, APPLICATION_FLOW_COOKIE_NAME);
}
