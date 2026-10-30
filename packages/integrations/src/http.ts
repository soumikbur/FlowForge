import { isPrivateOrBlockedDestination } from './ssrf.js';

export interface HttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  durationMs: number;
}

export async function executeSafeHttpRequest(
  options: HttpRequestOptions
): Promise<HttpResponse> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 10000,
    maxRetries = 2
  } = options;

  if (isPrivateOrBlockedDestination(url)) {
    throw new Error(`SSRF Prevention: Prohibited or private destination blocked: ${url}`);
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'FlowForge-Workflow-Engine/1.0',
          ...headers
        },
        body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
        signal: controller.signal,
        redirect: 'error' // Reject automated redirects to prevent redirect-based SSRF
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      let parsedData: unknown;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          parsedData = await response.json();
        } catch {
          parsedData = null;
        }
      } else {
        parsedData = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: parsedData,
        durationMs
      };
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      attempt++;

      if (attempt > maxRetries) {
        break;
      }
      // Exponential backoff
      await new Promise((res) => setTimeout(res, 200 * Math.pow(2, attempt)));
    }
  }

  throw new Error(`HTTP request failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}
