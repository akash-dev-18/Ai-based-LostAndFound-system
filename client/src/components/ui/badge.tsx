import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { CLAIM_STATUS, cn, ITEM_STATUS, MATCH_STATUS, PROCESSING_STATUS } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.01em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-paper-deep text-ink-soft",
        open: "border-cobalt/15 bg-cobalt-soft text-cobalt-deep",
        pending: "border-pending/15 bg-pending-soft text-pending",
        approved: "border-found/15 bg-found-soft text-found",
        resolved: "border-found/15 bg-found-soft text-found",
        rejected: "border-lost/15 bg-lost-soft text-lost",
        closed: "border-line-strong bg-paper-deep text-muted",
        lost: "border-lost/15 bg-lost-soft text-lost",
        found: "border-found/15 bg-found-soft text-found",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function ItemStatusBadge({ status }: { status: keyof typeof ITEM_STATUS }) {
  const meta = ITEM_STATUS[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ClaimStatusBadge({ status }: { status: keyof typeof CLAIM_STATUS }) {
  const meta = CLAIM_STATUS[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function MatchStatusBadge({ status }: { status: keyof typeof MATCH_STATUS }) {
  const meta = MATCH_STATUS[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ProcessingBadge({ status }: { status: keyof typeof PROCESSING_STATUS }) {
  const meta = PROCESSING_STATUS[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function TypeBadge({ type }: { type: "LOST" | "FOUND" }) {
  return (
    <Badge tone={type === "LOST" ? "lost" : "found"}>{type === "LOST" ? "Lost" : "Found"}</Badge>
  );
}
