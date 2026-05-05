import { NextRequest, NextResponse } from 'next/server';
import { maybeProxyToBff } from '../_lib/bff-route-proxy';
import { createWebHealthSnapshot } from '../_lib/web-health-response';

const BFF_HEALTH_TIMEOUT_MS = 5_000;

interface HealthLayerSnapshot {
  status: string;
  service: string;
  version?: string;
  build?: string | null;
  environment?: string;
  instanceId?: string;
  processId?: number;
  servedAt?: string;
  upstreamStatus?: number;
  error?: string;
}

function readString(
  payload: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readNullableString(
  payload: Record<string, unknown> | null,
  key: string,
): string | null | undefined {
  const value = payload?.[key];
  return value === null || typeof value === 'string' ? value : undefined;
}

function readNumber(
  payload: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const value = payload?.[key];
  return typeof value === 'number' ? value : undefined;
}

function normalizeBffHealthLayer(
  payload: Record<string, unknown> | null,
  upstreamStatus: number,
): HealthLayerSnapshot {
  return {
    status: readString(payload, 'status') ?? 'unknown',
    service: readString(payload, 'service') ?? 'bff-api',
    version: readString(payload, 'version'),
    build: readNullableString(payload, 'build'),
    environment: readString(payload, 'environment'),
    instanceId: readString(payload, 'instanceId'),
    processId: readNumber(payload, 'processId'),
    servedAt: readString(payload, 'servedAt'),
    upstreamStatus,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.name ? `${error.name}: ${error.message}` : error.message;
  }

  return String(error);
}

async function getBffHealthLayer(
  request: NextRequest,
): Promise<
  | { enabled: false; layer: null }
  | { enabled: true; layer: HealthLayerSnapshot }
> {
  try {
    const proxiedResponse = await maybeProxyToBff(request, '/bff/health', {
      timeoutMs: BFF_HEALTH_TIMEOUT_MS,
    });

    if (!proxiedResponse) {
      return { enabled: false, layer: null };
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await proxiedResponse.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    return {
      enabled: true,
      layer: normalizeBffHealthLayer(payload, proxiedResponse.status),
    };
  } catch (error) {
    return {
      enabled: true,
      layer: {
        status: 'unhealthy',
        service: 'bff-api',
        error: toErrorMessage(error),
      },
    };
  }
}

export async function GET(request: NextRequest) {
  const webLayer = createWebHealthSnapshot();
  const bffHealth = await getBffHealthLayer(request);
  const isBffHealthy =
    !bffHealth.enabled ||
    (bffHealth.layer.status === 'ok' &&
      bffHealth.layer.service === 'bff-api' &&
      (!bffHealth.layer.upstreamStatus ||
        (bffHealth.layer.upstreamStatus >= 200 &&
          bffHealth.layer.upstreamStatus < 300)));
  const status = isBffHealthy ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      service: 'web-app',
      version: webLayer.version,
      build: webLayer.build,
      environment: webLayer.environment,
      servedAt: webLayer.servedAt,
      bff: {
        enabled: bffHealth.enabled,
      },
      layers: {
        web: webLayer,
        ...(bffHealth.enabled ? { bff: bffHealth.layer } : {}),
      },
    },
    { status: status === 'ok' ? 200 : 503 },
  );
}
