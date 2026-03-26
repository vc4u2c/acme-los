import type {
  ClearWebAuthSessionResponse,
  GetCustomerProfileResponse,
  GetWebAuthSessionResponse,
  IssueCsrfTokenResponse,
  SyncWebAuthSessionRequest,
  SyncWebAuthSessionResponse,
  UpdateCustomerProfileRequest,
  UpdateCustomerProfileResponse,
} from '@acme-los/api/contracts';

export interface WebApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch {
  const resolvedFetchImpl = fetchImpl ?? globalThis.fetch;

  if (!resolvedFetchImpl) {
    throw new Error('Fetch API is not available for the web API client.');
  }

  return resolvedFetchImpl;
}

async function requestJson<TResponse>(
  fetchImpl: typeof fetch | undefined,
  input: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await resolveFetchImpl(fetchImpl)(input, {
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

export function createWebApiClient({
  baseUrl = '',
  fetchImpl,
}: WebApiClientOptions = {}) {
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
    auth: {
      getSession(
        options: { includeDebug?: boolean } = {},
      ): Promise<GetWebAuthSessionResponse> {
        const search = options.includeDebug === true ? '?includeDebug=1' : '';

        return requestJson<GetWebAuthSessionResponse>(
          fetchImpl,
          `${authSessionUrl}${search}`,
        );
      },
      syncSession(
        payload: SyncWebAuthSessionRequest,
      ): Promise<SyncWebAuthSessionResponse> {
        return requestWithCsrf<SyncWebAuthSessionResponse>(authSessionUrl, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      },
      clearSession(): Promise<ClearWebAuthSessionResponse> {
        return requestWithCsrf<ClearWebAuthSessionResponse>(authSessionUrl, {
          method: 'DELETE',
        });
      },
    },
    security: {
      getCsrfToken,
    },
    customer: {
      getProfile(): Promise<GetCustomerProfileResponse> {
        return requestJson<GetCustomerProfileResponse>(
          fetchImpl,
          customerProfileUrl,
        );
      },
      updateProfile(
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
    },
  };
}
