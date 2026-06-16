import type {
  ApplicationStepKey,
  ClearWebAuthSessionResponse,
  GetApplicationStepResponse,
  GetCustomerProfileResponse,
  GetWebAuthSessionResponse,
  IssueCsrfTokenResponse,
  SaveApplicationStepRequest,
  SaveApplicationStepResponse,
  StartEmailChangeRequest,
  StartEmailChangeResponse,
  StartPhoneChangeRequest,
  StartPhoneChangeResponse,
  SubmitApplicationRequest,
  SubmitApplicationResponse,
  SyncWebAuthSessionRequest,
  SyncWebAuthSessionResponse,
  TouchWebAuthSessionResponse,
  UpdateCustomerProfileRequest,
  UpdateCustomerProfileResponse,
  VerifyEmailChangeRequest,
  VerifyEmailChangeResponse,
  VerifyPhoneChangeRequest,
  VerifyPhoneChangeResponse,
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

function mergeJsonHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);

  if (!mergedHeaders.has('content-type')) {
    mergedHeaders.set('content-type', 'application/json');
  }

  return mergedHeaders;
}

async function requestJson<TResponse>(
  fetchImpl: typeof fetch | undefined,
  input: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await resolveFetchImpl(fetchImpl)(input, {
    ...init,
    headers: mergeJsonHeaders(init?.headers),
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorPayload = (await response.json()) as { error?: unknown };

      if (
        typeof errorPayload.error === 'string' &&
        errorPayload.error.trim().length > 0
      ) {
        errorMessage = errorPayload.error;
      }
    } catch {
      // Keep the status-based fallback for non-JSON error responses.
    }

    throw new Error(errorMessage);
  }

  return (await response.json()) as TResponse;
}

export function createWebApiClient({
  baseUrl = '',
  fetchImpl,
}: WebApiClientOptions = {}) {
  const authSessionUrl = `${baseUrl}/api/auth/session`;
  const authSessionTouchUrl = `${authSessionUrl}/touch`;
  const csrfUrl = `${baseUrl}/api/security/csrf`;
  const customerProfileUrl = `${baseUrl}/api/customer/profile`;
  const accountSecurityUrl = `${baseUrl}/api/account/security`;
  const applicationBaseUrl = `${baseUrl}/api/application`;
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
      touchSession(): Promise<TouchWebAuthSessionResponse> {
        return requestWithCsrf<TouchWebAuthSessionResponse>(
          authSessionTouchUrl,
          {
            method: 'POST',
          },
        );
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
    accountSecurity: {
      startEmailChange(
        payload: StartEmailChangeRequest,
      ): Promise<StartEmailChangeResponse> {
        return requestWithCsrf<StartEmailChangeResponse>(
          `${accountSecurityUrl}/email`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
      },
      verifyEmailChange(
        payload: VerifyEmailChangeRequest,
      ): Promise<VerifyEmailChangeResponse> {
        return requestWithCsrf<VerifyEmailChangeResponse>(
          `${accountSecurityUrl}/email/verify`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
      },
      startPhoneChange(
        payload: StartPhoneChangeRequest,
      ): Promise<StartPhoneChangeResponse> {
        return requestWithCsrf<StartPhoneChangeResponse>(
          `${accountSecurityUrl}/phone`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
      },
      verifyPhoneChange(
        payload: VerifyPhoneChangeRequest,
      ): Promise<VerifyPhoneChangeResponse> {
        return requestWithCsrf<VerifyPhoneChangeResponse>(
          `${accountSecurityUrl}/phone/verify`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
      },
    },
    application: {
      getStep(step: ApplicationStepKey): Promise<GetApplicationStepResponse> {
        return requestJson<GetApplicationStepResponse>(
          fetchImpl,
          `${applicationBaseUrl}/steps/${step}`,
        );
      },
      saveStep(
        step: ApplicationStepKey,
        payload: SaveApplicationStepRequest,
      ): Promise<SaveApplicationStepResponse> {
        return requestWithCsrf<SaveApplicationStepResponse>(
          `${applicationBaseUrl}/steps/${step}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
        );
      },
      submit(
        payload: SubmitApplicationRequest,
      ): Promise<SubmitApplicationResponse> {
        return requestWithCsrf<SubmitApplicationResponse>(
          `${applicationBaseUrl}/submit`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
      },
    },
  };
}
