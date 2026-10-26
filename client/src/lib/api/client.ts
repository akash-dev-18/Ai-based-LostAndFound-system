import createClient from "openapi-fetch";

import { authStore } from "../auth/auth-store";
import { API_ORIGIN } from "./config";
import type { paths } from "./schema";

export class ApiError extends Error {
  status: number;
  detail: string;
  fieldErrors: Record<string, string>;
  retryAfter: number | null;

  constructor(
    message: string,
    status: number,
    options?: {
      fieldErrors?: Record<string, string>;
      retryAfter?: number | null;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = message;
    this.fieldErrors = options?.fieldErrors ?? {};
    this.retryAfter = options?.retryAfter ?? null;
  }
}

function isAuthRequest(url: string) {
  return (
    url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/refresh")
  );
}

const authFetch = async (input: Request): Promise<Response> => {
  const request = input.clone();
  const accessToken = authStore.getAccessToken();
  if (accessToken) request.headers.set("Authorization", `Bearer ${accessToken}`);
  const retryRequest = request.clone();
  let response = await fetch(request);

  if (response.status === 401 && !isAuthRequest(request.url)) {
    const user = await authStore.refresh();
    if (user) {
      const token = authStore.getAccessToken();
      if (token) retryRequest.headers.set("Authorization", `Bearer ${token}`);
      response = await fetch(retryRequest);
    }
  }
  return response;
};

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit) {
  const send = () => {
    const headers = new Headers(init?.headers);
    const token = authStore.getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "include" });
  };
  let response = await send();
  if (response.status === 401) {
    const user = await authStore.refresh();
    if (user) response = await send();
  }
  return response;
}

export const api = createClient<paths>({
  baseUrl: API_ORIGIN,
  credentials: "include",
  fetch: authFetch,
});

type ApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

function detailFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return null;
  const detail = (payload as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        typeof entry === "object" && entry !== null && "msg" in entry ? String(entry.msg) : null,
      )
      .filter((entry): entry is string => Boolean(entry));
    return messages.length > 0 ? messages.join(" ") : null;
  }
  return null;
}

export async function toApiError(response: Response, error: unknown) {
  const payload =
    error ??
    (await response
      .clone()
      .json()
      .catch(() => null));
  const detail = detailFromPayload(payload) ?? response.statusText ?? "Something went wrong";
  const fieldErrors: Record<string, string> = {};
  if (payload && typeof payload === "object" && "detail" in payload) {
    const entries = (payload as { detail: unknown }).detail;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (
          typeof entry === "object" &&
          entry !== null &&
          "loc" in entry &&
          "msg" in entry &&
          Array.isArray(entry.loc)
        ) {
          const field = [...entry.loc].reverse().find((part) => typeof part === "string");
          if (typeof field === "string") fieldErrors[field] = String(entry.msg);
        }
      }
    }
  }
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;
  return new ApiError(detail, response.status, {
    fieldErrors,
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
  });
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (result.error !== undefined) {
    throw new ApiError("Request failed", result.response.status);
  }
  return result.data as T;
}

export async function unwrapAsync<T>(result: ApiResult<T>): Promise<T> {
  if (result.error !== undefined) throw await toApiError(result.response, result.error);
  return result.data as T;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfter) {
      return `Too many attempts. Try again in ${error.retryAfter} seconds.`;
    }
    return error.detail;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
