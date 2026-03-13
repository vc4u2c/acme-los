import type {
  CreateApplicationRequest,
  CreateApplicationResponse,
  GetApplicationResponse,
  PipelineSummaryResponse,
  SubmitUnderwritingDecisionRequest,
  SubmitUnderwritingDecisionResponse,
  UpdateBorrowerProfileRequest,
  UpdateBorrowerProfileResponse,
} from '@acme-los/api/contracts';

export interface LosApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

async function requestJson<TResponse>(
  fetchImpl: typeof fetch,
  input: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetchImpl(input, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export function createLosApiClient({
  baseUrl,
  fetchImpl = fetch,
}: LosApiClientOptions) {
  const applicationsBase = `${baseUrl}/applications`;
  const borrowersBase = `${baseUrl}/borrowers`;
  const underwritingBase = `${baseUrl}/underwriting`;

  return {
    getApplication(applicationId: string): Promise<GetApplicationResponse> {
      return requestJson<GetApplicationResponse>(
        fetchImpl,
        `${applicationsBase}/${applicationId}`,
      );
    },
    createApplication(
      payload: CreateApplicationRequest,
    ): Promise<CreateApplicationResponse> {
      return requestJson<CreateApplicationResponse>(
        fetchImpl,
        applicationsBase,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    },
    updateBorrowerProfile(
      payload: UpdateBorrowerProfileRequest,
    ): Promise<UpdateBorrowerProfileResponse> {
      return requestJson<UpdateBorrowerProfileResponse>(
        fetchImpl,
        `${borrowersBase}/${payload.borrowerId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
    },
    submitUnderwritingDecision(
      payload: SubmitUnderwritingDecisionRequest,
    ): Promise<SubmitUnderwritingDecisionResponse> {
      return requestJson<SubmitUnderwritingDecisionResponse>(
        fetchImpl,
        `${underwritingBase}/${payload.applicationId}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    },
    getPipelineSummary(): Promise<PipelineSummaryResponse> {
      return requestJson<PipelineSummaryResponse>(
        fetchImpl,
        `${applicationsBase}/pipeline`,
      );
    },
  };
}
