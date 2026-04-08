export interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** If set, this call throws instead of resolving. */
  throws?: Error;
}

/**
 * Minimal fetch mock. Handles both call shapes we care about:
 *   fetch(url, init)          — legacy signature
 *   fetch(request)            — what `openapi-fetch` passes
 */
export function mockFetch(queue: MockResponse[]): {
  fetch: typeof fetch;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];
  let idx = 0;

  const fetchImpl = (async (
    input: Request | string | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const call = await extractCall(input, init);
    calls.push(call);

    const next = queue[idx] ?? queue[queue.length - 1];
    idx += 1;
    if (!next) throw new Error('mockFetch: no response configured');
    if (next.throws) throw next.throws;

    const status = next.status ?? 200;
    const responseBody = next.body === undefined ? null : next.body;
    const responseHeaders = new Headers({
      'content-type': 'application/json',
      ...(next.headers ?? {})
    });
    return new Response(responseBody === null ? null : JSON.stringify(responseBody), {
      status,
      headers: responseHeaders
    });
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}

async function extractCall(
  input: Request | string | URL,
  init: RequestInit | undefined
): Promise<MockCall> {
  if (input instanceof Request) {
    const rawBody = await input.clone().text();
    return {
      url: input.url,
      method: input.method.toUpperCase(),
      headers: headersToRecord(input.headers),
      body: rawBody ? safeJson(rawBody) : undefined
    };
  }

  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  const body = init?.body ? safeJson(String(init.body)) : undefined;
  return { url, method, headers, body };
}

function headersToRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function normalizeHeaders(input: HeadersInit | undefined): Record<string, string> {
  if (!input) return {};
  if (input instanceof Headers) return headersToRecord(input);
  if (Array.isArray(input)) {
    return Object.fromEntries(input.map(([k, v]) => [k.toLowerCase(), v]));
  }
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k.toLowerCase(), String(v)]));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
