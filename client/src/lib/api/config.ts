const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

export const API_BASE_URL = configuredBaseUrl;
export const API_ORIGIN = configuredBaseUrl.replace(/\/api\/v1$/, "");
