import { type ClassValue, clsx } from "clsx";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function shortId(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 8).toUpperCase();
}

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Not set";
  if (Math.abs(Date.now() - date.getTime()) < 45_000) return "just now";
  return `${formatDistanceToNowStrict(date)} ago`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Not set";
  if (isToday(date)) return `Today, ${format(date, "h:mm a")}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, "h:mm a")}`;
  return format(date, "MMM d, yyyy");
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Not set";
  return format(date, "MMM d, yyyy · h:mm a");
}

export function formatScore(score: number | null | undefined) {
  if (score === null || score === undefined) return "—";
  return `${Math.round(score * 100)}%`;
}

export function toIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function toDateTimeLocal(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function getInitialsColor(name: string | null | undefined) {
  const colors = [
    "bg-[#E8EEFF] text-[#183FBF]",
    "bg-[#E6F3ED] text-[#167A5A]",
    "bg-[#FBF0D8] text-[#9A6400]",
    "bg-[#F8E9E4] text-[#B5472E]",
    "bg-[#EFE8FA] text-[#6941C6]",
  ];
  const value = name ?? "";
  const index = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return colors[index % colors.length] ?? colors[0];
}

export const CATEGORIES = [
  "Bags",
  "Electronics",
  "Wallets",
  "Cards & IDs",
  "Keys",
  "Bottles",
  "Clothing",
  "Accessories",
  "Books & Notes",
  "Other",
] as const;

export const LOCATIONS = [
  "Hartley Library",
  "Science Library",
  "Student Center",
  "Dining Hall",
  "Recreation Center",
  "Engineering Building",
  "Arts Building",
  "Mathematics Building",
  "Parking Garage",
  "Main Gate",
] as const;

export const ITEM_STATUS = {
  OPEN: { label: "Open", tone: "open" },
  CLAIM_PENDING: { label: "Claim in progress", tone: "pending" },
  RESOLVED: { label: "Returned", tone: "resolved" },
  CLOSED: { label: "Closed", tone: "closed" },
} as const;

export const CLAIM_STATUS = {
  PENDING: { label: "Under review", tone: "pending" },
  APPROVED: { label: "Approved", tone: "approved" },
  REJECTED: { label: "Not approved", tone: "rejected" },
  CANCELLED: { label: "Cancelled", tone: "closed" },
  COMPLETED: { label: "Handover complete", tone: "resolved" },
} as const;

export const MATCH_STATUS = {
  PENDING: { label: "New match", tone: "open" },
  NOTIFIED: { label: "Notified", tone: "pending" },
  CONFIRMED: { label: "Confirmed", tone: "resolved" },
  REJECTED: { label: "Not a match", tone: "closed" },
  STALE: { label: "Outdated", tone: "closed" },
} as const;

export const PROCESSING_STATUS = {
  PENDING: { label: "Waiting to index", tone: "pending" },
  PROCESSING: { label: "Indexing", tone: "pending" },
  READY: { label: "Searchable", tone: "resolved" },
  FAILED: { label: "Indexing failed", tone: "rejected" },
  ARCHIVED: { label: "Archived", tone: "closed" },
} as const;

export function titleCase(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeLabel(value: string): string {
  const normalized = value.replaceAll("_", " ").replaceAll(".", " ").trim().toLowerCase();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
