/**
 * The HTTP core of customdomain-js: one function every SDK call to the API goes through.
 *
 * It adds the API date header, a per call timeout, an abort signal, retries with backoff and jitter
 * (honouring Retry-After), an Idempotency-Key that stays the same across retries, and the request id
 * on a thrown error. It also holds `CustomDomainError`, which index.ts re-exports.
 * Keep it free of DOM and of imports from index.ts so it stays small and testable on its own.
 */

/** The API date this release of the SDK was built against, sent as `CustomDomain-Version` on every call. */
export const API_VERSION = "2026-11-22";

/** Header that names the API date. */
export const API_VERSION_HEADER = "CustomDomain-Version";
/** Header that makes a retried write safe. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
/** Response header that carries the id of a request, for support. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/** Default per attempt timeout, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Default number of retries after the first attempt. */
export const DEFAULT_RETRIES = 2;
/** Default base of the backoff, in milliseconds. */
export const DEFAULT_RETRY_BASE_MS = 500;
const MAX_BACKOFF_MS = 8_000;
/** A Retry-After longer than this is not waited for: the error is thrown so the caller decides. */
const MAX_RETRY_WAIT_MS = 30_000;

/**
 * Routes that accept an `Idempotency-Key`. The SDK generates a key for a call to one of them when the
 * caller did not pass one, and reuses it across its own retries.
 */
const IDEMPOTENT_ROUTES = new Set(["/v1/registrar/purchase"]);

/**
 * Thrown by `checkDomain` and `checkRecords`, passed to `onError`, and the
 * shape of the `customdomain:error` event detail.
 *
 * `status` is the HTTP status of the control plane response the error came
 * from. It is unset when the error was raised by the widget or by the SDK
 * itself (an `onError` call, a missing `container`, a timeout). `requestId` is the
 * `X-Request-Id` of that response: quote it to support. The SDK already retries a
 * network failure, a timeout, a 429 and any 5xx before it throws (see `RequestOptions`);
 * a 4xx other than 429 answers the same way until the request changes (the token,
 * the domain, the records). A network failure that outlasts the retries is a
 * plain `TypeError` from `fetch`; a timeout is a `CustomDomainError` with code
 * `request_timeout`.
 */
export class CustomDomainError extends Error {
  code: string;
  details?: string;
  /** HTTP status of the control plane response, when there was one. */
  readonly status?: number;
  /** `X-Request-Id` of the control plane response, when there was one. */
  readonly requestId?: string;
  constructor(code: string, message: string, details?: string, status?: number, requestId?: string) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
    this.requestId = requestId;
    this.name = "CustomDomainError";
  }
}

/** Options that apply to one call and override the client's defaults. */
export interface RequestOptions {
  /** Give up on one attempt after this many milliseconds. `0` turns the timeout off. Default 30000. */
  timeoutMs?: number;
  /** Abort the call. The promise rejects with the signal's reason and nothing is retried. */
  signal?: AbortSignal;
  /** Retries after the first attempt, for a network failure, a timeout, a 429 or a 5xx. `0` turns retries off. Default 2. */
  retries?: number;
  /** Sent as `Idempotency-Key`. The same key is sent again on every retry of this call. */
  idempotencyKey?: string;
}

/** Defaults a client applies to every call. */
export interface ClientOptions {
  /** API base URL. Defaults to CustomDomain™ cloud. */
  apiBase?: string;
  /** Default of `RequestOptions.timeoutMs`. */
  timeoutMs?: number;
  /** Default of `RequestOptions.retries`. */
  retries?: number;
  /** The API date sent as `CustomDomain-Version`. `null` sends no date. Defaults to the date this release was built against. */
  apiVersion?: string | null;
  /** Base of the retry backoff in milliseconds (default 500, doubling per retry, with jitter). */
  retryBaseMs?: number;
}

export interface SendArgs {
  url: string;
  method: string;
  token: string;
  body?: unknown;
  /** True for a call that changes nothing, so it can be retried without an Idempotency-Key. */
  readOnly?: boolean;
  call?: RequestOptions;
  defaults?: ClientOptions;
}

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; error: unknown; retryable: boolean; waitMs?: number };

/** A fresh random key for an Idempotency-Key header. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  let out = "";
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Retry-After as milliseconds: whole seconds or an HTTP date. Undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** Backoff for the retry after attempt `attempt` (0 based): exponential, half fixed and half jitter. */
function backoffMs(attempt: number, baseMs: number): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, baseMs * 2 ** attempt);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Build the error for a non 2xx response: code, title and details from the body, id from the header. */
export async function toError(res: Response): Promise<CustomDomainError> {
  const requestId = res.headers?.get?.(REQUEST_ID_HEADER) || undefined;
  try {
    const body = await res.json();
    return new CustomDomainError(
      body.code || `http_${res.status}`,
      body.title || res.statusText,
      body.details,
      res.status,
      requestId
    );
  } catch {
    return new CustomDomainError(`http_${res.status}`, res.statusText, undefined, res.status, requestId);
  }
}

async function attempt(
  args: SendArgs,
  headers: Record<string, string>,
  timeoutMs: number,
  mayRetry: boolean
): Promise<Outcome> {
  const caller = args.call?.signal;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, timeoutMs)
      : undefined;
  const onCallerAbort = () => ctrl.abort();
  caller?.addEventListener("abort", onCallerAbort, { once: true });
  try {
    const res = await fetch(args.url, {
      method: args.method,
      headers,
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true, value: await res.json() };
    const error = await toError(res);
    const status = res.status;
    const retryable = mayRetry && (status === 429 || status >= 500);
    const wait = parseRetryAfter(res.headers?.get?.("Retry-After"));
    return { ok: false, error, retryable, waitMs: wait };
  } catch (e) {
    if (caller?.aborted) return { ok: false, error: abortReason(caller), retryable: false };
    if (timedOut) {
      const error = new CustomDomainError("request_timeout", `No response within ${timeoutMs} ms.`);
      return { ok: false, error, retryable: mayRetry };
    }
    // fetch rejects with a TypeError when the network fails; anything else (such as a body that is
    // not JSON) is not worth sending again.
    return { ok: false, error: e, retryable: mayRetry && e instanceof TypeError };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    caller?.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Send one JSON request and return the parsed JSON body. Throws a `CustomDomainError` for an error
 * response, a `request_timeout` one for a timeout, the signal's reason when the caller aborts, and the
 * `fetch` error for a network failure that outlasts the retries.
 */
export async function sendJson(args: SendArgs): Promise<any> {
  const defaults = args.defaults || {};
  const call = args.call || {};
  const timeoutMs = call.timeoutMs ?? defaults.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.max(0, call.retries ?? defaults.retries ?? DEFAULT_RETRIES);
  const baseMs = defaults.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const apiVersion = defaults.apiVersion === undefined ? API_VERSION : defaults.apiVersion;

  let path = "";
  try {
    path = new URL(args.url).pathname;
  } catch {
    /* a relative base: no route match, no generated key */
  }
  const idempotencyKey = call.idempotencyKey || (IDEMPOTENT_ROUTES.has(path) ? newIdempotencyKey() : undefined);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${args.token}`,
  };
  if (apiVersion) headers[API_VERSION_HEADER] = apiVersion;
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;

  // A call that can change something is only sent again when it carries an Idempotency-Key.
  const method = args.method.toUpperCase();
  const changes = method === "POST" || method === "PATCH";
  const mayRetry = !changes || !!args.readOnly || !!idempotencyKey;

  if (call.signal?.aborted) throw abortReason(call.signal);
  for (let n = 0; ; n++) {
    const out = await attempt(args, headers, timeoutMs, mayRetry);
    if (out.ok) return out.value;
    if (!out.retryable || n >= maxRetries) throw out.error;
    const wait = out.waitMs ?? backoffMs(n, baseMs);
    if (wait > MAX_RETRY_WAIT_MS) throw out.error;
    await sleep(wait, call.signal);
  }
}
