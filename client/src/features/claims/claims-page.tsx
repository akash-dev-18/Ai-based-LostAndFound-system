import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FileCheck2, Search } from "lucide-react";
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
import { useMyClaims } from "@/lib/api/hooks";
import type { ClaimStatus } from "@/lib/api/types";
import { formatRelative } from "@/lib/utils";

const TABS: { value: ClaimStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "In review" },
  { value: "APPROVED", label: "Approved" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
];

export function ClaimsPage() {
  const [status, setStatus] = useState<ClaimStatus | undefined>();
  const [page, setPage] = useState(1);
  const query = useMyClaims({ status, page, page_size: 15 });

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Your claims"
        title="Claims you’ve sent"
        description="Follow proof review and handover progress for the items you’ve claimed."
        actions={
          <Link to="/">
            <Button variant="secondary" leftIcon={<Search className="size-4" />}>
              Find an item
            </Button>
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

      <div className="mt-5">
        {query.isLoading ? (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {Array.from({ length: 4 }, (_, index) => `skeleton-${index}`).map((key) => (
              <div
                key={key}
                className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
              >
                <Skeleton className="size-14 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title={status ? "No claims with this status" : "You haven’t claimed anything yet"}
            description={
              status
                ? "Try another status or view all of your claims."
                : "Found something that might be yours? Open the report and send a claim with a few identifying details."
            }
            action={
              <Link to="/">
                <Button variant="secondary">Browse found items</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_110px_84px] gap-4 border-b border-line bg-paper-deep/30 px-4 py-2.5 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase lg:grid">
                <span>Item</span>
                <span>Claim</span>
                <span>Report</span>
                <span>Sent</span>
                <span />
              </div>
              <div className="divide-y divide-line">
                {query.data.items.map((claim) => (
                  <div
                    key={claim.id}
                    className="group grid gap-3 px-4 py-3.5 transition-colors hover:bg-paper-deep/25 lg:grid-cols-[minmax(0,1fr)_120px_120px_110px_84px] lg:items-center lg:gap-4"
                  >
                    <Link
                      to="/claims/$claimId"
                      params={{ claimId: claim.id }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <ItemImage
                        src={claim.item_image_url}
                        alt={claim.item_title ?? "Claimed item"}
                        type={claim.item_type ?? undefined}
                        showLabel={false}
                        className="size-14 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0">
                        {claim.item_type ? <TypeBadge type={claim.item_type} /> : null}
                        <p className="mt-1 truncate text-sm font-semibold text-ink group-hover:text-cobalt">
                          {claim.item_title ?? "Claimed item"}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[0.68rem] text-muted">
                          {claim.message}
                        </p>
                      </div>
                    </Link>

                    <div>
                      <ClaimStatusBadge status={claim.status} />
                    </div>

                    <div>
                      {claim.item_status ? (
                        <ItemStatusBadge status={claim.item_status} />
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>

                    <div className="text-[0.68rem] leading-5 text-muted">
                      <p>{formatRelative(claim.created_at)}</p>
                      {claim.reviewed_at ? (
                        <p>Reviewed {formatRelative(claim.reviewed_at)}</p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2 lg:justify-end">
                      <Link
                        to="/claims/$claimId"
                        params={{ claimId: claim.id }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-cobalt hover:underline"
                      >
                        View <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8">
              <Pagination
                page={query.data.page}
                pages={query.data.pages}
                total={query.data.total}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
