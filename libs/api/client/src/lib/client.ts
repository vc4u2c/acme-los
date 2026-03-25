import type {
  ClearWebAuthSessionResponse,
  CreateApplicationRequest,
  CreateApplicationResponse,
  GetCustomerProfileResponse,
  GetApplicationResponse,
  GetWebAuthSessionResponse,
  IssueCsrfTokenResponse,
  PipelineSummaryResponse,
  SyncWebAuthSessionRequest,
  SyncWebAuthSessionResponse,
  SubmitUnderwritingDecisionRequest,
  SubmitUnderwritingDecisionResponse,
  UpdateCustomerProfileRequest,
  UpdateCustomerProfileResponse,
  UpdateBorrowerProfileRequest,
  UpdateBorrowerProfileResponse,
} from '@acme-los/api/contracts';

export interface LosApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface WebAppApiClientOptions {
  baseUrl?: string;
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

export function createWebAppApiClient({
  baseUrl = '',
  fetchImpl = fetch,
}: WebAppApiClientOptions = {}) {
  const authSessionUrl = `${baseUrl}/api/auth/session`;
  const csrfUrl = `${baseUrl}/api/security/csrf`;
  const customerProfileUrl = `${baseUrl}/api/customer/profile`;
  let csrfTokenPromise: Promise<string> | null = null;

  async function getCsrfToken(): Promise<string> {
    if (!csrfTokenPromise) {
      csrfTokenPromise = requestJson<IssueCsrfTokenResponse>(fetchImpl, csrfUrl)
        .then((response) => response.csrfToken)
        .catch((error) => {
          csrfTokenPromise = null;
          throw error;
        });
    }

    return csrfTokenPromise;
  }

  async function requestWithCsrf<TResponse>(
    input: string,
    init: RequestInit,
  ): Promise<TResponse> {
    const csrfToken = await getCsrfToken();

    return requestJson<TResponse>(fetchImpl, input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        'x-csrf-token': csrfToken,
      },
    });
  }

  return {
    getAuthSession(
      options: { includeDebug?: boolean } = {},
    ): Promise<GetWebAuthSessionResponse> {
      const search = options.includeDebug === true ? '?includeDebug=1' : '';

      return requestJson<GetWebAuthSessionResponse>(
        fetchImpl,
        `${authSessionUrl}${search}`,
      );
    },
    syncAuthSession(
      payload: SyncWebAuthSessionRequest,
    ): Promise<SyncWebAuthSessionResponse> {
      return requestWithCsrf<SyncWebAuthSessionResponse>(authSessionUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    clearAuthSession(): Promise<ClearWebAuthSessionResponse> {
      return requestWithCsrf<ClearWebAuthSessionResponse>(authSessionUrl, {
        method: 'DELETE',
      });
    },
    getCustomerProfile(): Promise<GetCustomerProfileResponse> {
      return requestJson<GetCustomerProfileResponse>(
        fetchImpl,
        customerProfileUrl,
      );
    },
    updateCustomerProfile(
      payload: UpdateCustomerProfileRequest,
    ): Promise<UpdateCustomerProfileResponse> {
      return requestWithCsrf<UpdateCustomerProfileResponse>(
        customerProfileUrl,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
    },
  };
}
