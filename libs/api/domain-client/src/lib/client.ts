import type {
  ApplicationStepKey,
  CreateApplicationRequest,
  CreateApplicationResponse,
  GetApplicationStepResponse,
  GetCustomerProfileResponse,
  SaveApplicationStepResponse,
  SubmitApplicationResponse,
  UpdateCustomerProfileRequest,
  UpdateCustomerProfileResponse,
} from '@acme-los/api/contracts';

export interface DomainApiClientOptions {
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

export function createCustomerDomainApiClient({
  baseUrl,
  fetchImpl = fetch,
}: DomainApiClientOptions) {
  const customersBase = `${baseUrl}/customers`;

  return {
    getProfile(customerId: string): Promise<GetCustomerProfileResponse> {
      return requestJson<GetCustomerProfileResponse>(
        fetchImpl,
        `${customersBase}/${customerId}/profile`,
      );
    },
    updateProfile(
      customerId: string,
      payload: UpdateCustomerProfileRequest,
    ): Promise<UpdateCustomerProfileResponse> {
      return requestJson<UpdateCustomerProfileResponse>(
        fetchImpl,
        `${customersBase}/${customerId}/profile`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
    },
  };
}

export function createApplicationDomainApiClient({
  baseUrl,
  fetchImpl = fetch,
}: DomainApiClientOptions) {
  const applicationsBase = `${baseUrl}/applications`;

  return {
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
    getStep(
      applicationId: string,
      step: ApplicationStepKey,
    ): Promise<GetApplicationStepResponse> {
      return requestJson<GetApplicationStepResponse>(
        fetchImpl,
        `${applicationsBase}/${applicationId}/steps/${step}`,
      );
    },
    saveStep(
      applicationId: string,
      step: ApplicationStepKey,
      payload: Record<string, unknown>,
    ): Promise<SaveApplicationStepResponse> {
      return requestJson<SaveApplicationStepResponse>(
        fetchImpl,
        `${applicationsBase}/${applicationId}/steps/${step}`,
        {
          method: 'PUT',
          body: JSON.stringify({ payload }),
        },
      );
    },
    submit(applicationId: string): Promise<SubmitApplicationResponse> {
      return requestJson<SubmitApplicationResponse>(
        fetchImpl,
        `${applicationsBase}/${applicationId}/submit`,
        {
          method: 'POST',
        },
      );
    },
  };
}
