import type { components } from "@/lib/api/schema";

import { API_BASE_URL } from "../api/config";

export type User = components["schemas"]["UserRead"];
type AuthResponse = components["schemas"]["AuthResponse"];

export type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous";

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  accessToken: string | null;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const initialState: AuthState = {
  status: "idle",
  user: null,
  accessToken: null,
};

let state: AuthState = initialState;
let refreshPromise: Promise<User | null> | null = null;
const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("lostfound-auth") : null;

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: AuthState) {
  state = next;
  emit();
}

function clearState() {
  setState({ status: "anonymous", user: null, accessToken: null });
}

async function readError(response: Response) {
  let message = response.statusText || "Something went wrong";
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") {
      message = payload.detail;
    } else if (Array.isArray(payload.detail)) {
      const messages = payload.detail
        .map((entry) =>
          typeof entry === "object" && entry !== null && "msg" in entry ? String(entry.msg) : null,
        )
        .filter((entry): entry is string => Boolean(entry));
      if (messages.length > 0) message = messages.join(" ");
    }
  } catch {
    return new AuthError(message, response.status);
  }
  return new AuthError(message, response.status);
}

async function requestSessionRefresh() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      clearState();
      return null;
    }
    const payload = (await response.json()) as AuthResponse;
    setState({
      status: "authenticated",
      user: payload.user,
      accessToken: payload.access_token,
    });
    return payload.user;
  } catch {
    clearState();
    return null;
  }
}

async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  const run = () => requestSessionRefresh();
  const lockManager = navigator.locks;
  const pending: Promise<User | null> = lockManager
    ? (lockManager.request("lostfound-auth-refresh", () =>
        run(),
      ) as unknown as Promise<User | null>)
    : run();
  refreshPromise = pending.finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function submitAuth(path: "/auth/login" | "/auth/register", body: Record<string, string>) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  const payload = (await response.json()) as AuthResponse;
  setState({
    status: "authenticated",
    user: payload.user,
    accessToken: payload.access_token,
  });
  channel?.postMessage({ type: "login" });
  return payload.user;
}

channel?.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === "logout") {
    clearState();
  }
  if (event.data?.type === "login" && state.status !== "authenticated") {
    void refreshSession();
  }
});

export const authStore = {
  getSnapshot: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getAccessToken: () => state.accessToken,
  getUser: () => state.user,
  async ensureSession() {
    if (state.status === "authenticated" && state.user) return state.user;
    if (state.status === "anonymous") return null;
    return refreshSession();
  },
  refresh: refreshSession,
  async login(email: string, password: string) {
    return submitAuth("/auth/login", { email, password });
  },
  async register(name: string, email: string, password: string) {
    return submitAuth("/auth/register", { name, email, password });
  },
  async logout() {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } finally {
      clearState();
      channel?.postMessage({ type: "logout" });
    }
  },
  setUser(user: User) {
    setState({ ...state, user });
  },
  clear: clearState,
};
