import { useSyncExternalStore } from "react";

import { authStore } from "./auth-store";

export function useAuth() {
  const state = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getSnapshot,
  );
  return {
    ...state,
    isAuthenticated: state.status === "authenticated",
    isManager: state.user?.role === "MANAGER" || state.user?.role === "ADMIN",
    isAdmin: state.user?.role === "ADMIN",
    login: authStore.login,
    register: authStore.register,
    logout: authStore.logout,
    refresh: authStore.refresh,
    setUser: authStore.setUser,
  };
}
