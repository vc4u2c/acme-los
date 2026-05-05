import { createWebHealthResponse } from '../../_lib/web-health-response';

export async function GET() {
  return createWebHealthResponse();
}
