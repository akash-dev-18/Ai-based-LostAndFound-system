export function safeInternalPath(value: string | null | undefined, fallback = "/") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function redirectTarget() {
  if (typeof window === "undefined") return "/";
  return safeInternalPath(new URLSearchParams(window.location.search).get("redirect"));
}
