import { authenticatedFetch, buildBackendAuthHeaders, getProxyOrigin } from "./apiUtils";

export type AsyncJobStatus = "QUEUED" | "INPROGRESS" | "DONE" | "ERROR";

export interface AsyncJobStatusResponse {
  jobId: string;
  status: AsyncJobStatus;
  type?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  resultCount?: string | number;
  error?: string;
}

export interface StartAsyncResult {
  jobId: string;
  status: AsyncJobStatus;
}

export interface AwaitOptions {
  connectionConfig: any;
  signal?: AbortSignal;
  // in milliseconds
  initialDelay?: number; // default 500ms
  maxDelay?: number; // default 4000ms
  timeoutMs?: number; // default 60_000ms
  onUpdate?: (s: AsyncJobStatusResponse) => void;
}

function buildProxyUrl(path: string, connectionConfig: any): URL {
  const url = new URL(path, getProxyOrigin());
  url.searchParams.append("url", connectionConfig.backend_url);

  return url;
}

export async function startAsyncJob(
  proxyPath: string,
  connectionConfig: any,
  method: string,
  body?: unknown
): Promise<StartAsyncResult> {
  const proxyUrl = buildProxyUrl(proxyPath, connectionConfig);

  const resp = await authenticatedFetch(proxyUrl.toString(), {
    method,
    headers: buildBackendAuthHeaders(connectionConfig),
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Failed to start async job (${resp.status})`);
  }

  const json = await resp.json();
  const result = json?.result || json?.Result || json;
  const jobId: string = result?.jobId || result?.JobId || result?.jobID;
  const status: AsyncJobStatus = result?.status;
  if (!jobId) {
    throw new Error("Backend did not return a jobId");
  }

  return { jobId, status };
}

export async function fetchJobStatus(
  jobId: string,
  connectionConfig: any,
  signal?: AbortSignal
): Promise<AsyncJobStatusResponse> {
  const proxyUrl = buildProxyUrl(`/proxy/async/${encodeURIComponent(jobId)}/status`, connectionConfig);
  const resp = await authenticatedFetch(proxyUrl.toString(), {
    method: "GET",
    headers: buildBackendAuthHeaders(connectionConfig),
    signal,
  });
  if (resp.status === 404) {
    throw new Error("Job not found (404)");
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `Failed to query job status (${resp.status})`);
  }
  const json = await resp.json();
  const result = json?.result || json?.Result || json;
  return {
    jobId: result?.jobId,
    status: result?.status,
    type: result?.type,
    createdAt: result?.createdAt,
    startedAt: result?.startedAt,
    finishedAt: result?.finishedAt,
    resultCount: result?.resultCount,
    error: result?.error,
  } as AsyncJobStatusResponse;
}

export async function awaitJob(
  jobId: string,
  opts: AwaitOptions
): Promise<AsyncJobStatusResponse> {
  const {
    connectionConfig,
    signal,
    initialDelay = 500,
    maxDelay = 4000,
    timeoutMs = 60_000,
    onUpdate,
  } = opts;

  const start = Date.now();
  let delay = initialDelay;

  // First immediate check
  let status = await fetchJobStatus(jobId, connectionConfig, signal);
  onUpdate?.(status);
  while (status.status === "QUEUED" || status.status === "INPROGRESS") {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("Async job timed out");
    }

    await new Promise((res) => setTimeout(res, delay));
    delay = Math.min(Math.floor(delay * 1.6), maxDelay);
    status = await fetchJobStatus(jobId, connectionConfig, signal);
    onUpdate?.(status);
  }

  return status;
}
