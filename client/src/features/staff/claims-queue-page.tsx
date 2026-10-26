import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ItemImage } from "@/components/items/item-image";
import { PageHeader } from "@/components/layout/page-header";
import { ClaimStatusBadge, ItemStatusBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useManagerClaims } from "@/lib/api/hooks";
import type { ClaimStatus } from "@/lib/api/types";
import { formatRelative } from "@/lib/utils";

const TABS: { value: ClaimStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

export function ClaimsQueuePage() {
  const [status, setStatus] = useState<ClaimStatus | undefined>("PENDING");
  const [page, setPage] = useState(1);
  const query = useManagerClaims({ status, page, page_size: 12 });

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Staff workspace"
        title="Claim review"
        description="Compare proof with the report and keep handovers moving safely."
        actions={
          <Link to="/staff">
            <Button variant="secondary">Overview</Button>
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status ?? "ALL"}
          onValueChange={(value) => {
            setStatus(value === "ALL" ? undefined : (value as ClaimStatus));
            setPage(1);
          }}
        >
          <TabsList className="no-scrollbar max-w-full overflow-x-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {query.data ? (
          <p className="text-xs text-muted">
            {query.data.total} claim{query.data.total === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-32 w-full rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data?.items.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={status === "PENDING" ? "The queue is clear" : "No claims here"}
            description={
              status === "PENDING"
                ? "There are no claims waiting for review right now."
                : "Try another status to see more claims."
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[1fr_180px_140px_100px] gap-4 border-b border-line px-5 py-3 text-[0.65rem] font-semibold tracking-[0.12em] text-muted uppercase lg:grid">
                <span>Claim</span>
                <span>Claimant</span>
                <span>Status</span>
                <span />
              </div>
              <div className="divide-y divide-line">
                {query.data?.items.map((claim) => (
                  <Link
                    key={claim.id}
                    to="/staff/claims/$claimId"
                    params={{ claimId: claim.id }}
                    className="group grid gap-3 px-4 py-4 transition-colors hover:bg-paper-deep/50 sm:px-5 lg:grid-cols-[1fr_180px_140px_100px] lg:items-center lg:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ItemImage
                        src={claim.item_image_url}
                        alt={claim.item_title ?? "Claimed item"}
                        type={claim.item_type ?? undefined}
                        showLabel={false}
                        className="size-14 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {claim.item_type ? <TypeBadge type={claim.item_type} /> : null}
                          {claim.item_status ? (
                            <ItemStatusBadge status={claim.item_status} />
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-ink group-hover:text-cobalt">
                          {claim.item_title ?? "Claimed item"}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{claim.message}</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted">
                      <span className="lg:hidden">Claimant: </span>
                      <span className="font-medium text-ink">
                        {claim.claimant_name ?? "Unknown"}
                      </span>
                      <p className="mt-0.5">{formatRelative(claim.created_at)}</p>
                    </div>
                    <div>
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
                      Review <ArrowUpRight className="size-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-8">
              <Pagination
                page={query.data?.page ?? 1}
                pages={query.data?.pages ?? 1}
                total={query.data?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
