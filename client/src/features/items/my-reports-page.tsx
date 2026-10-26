import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FilePlus2, Sparkles } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ItemImage } from "@/components/items/item-image";
import { PageHeader } from "@/components/layout/page-header";
import { ItemStatusBadge, ProcessingBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyItems } from "@/lib/api/hooks";
import type { ItemStatus } from "@/lib/api/types";
import { formatRelative } from "@/lib/utils";

const TABS: { value: ItemStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "CLAIM_PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export function MyReportsPage() {
  const [status, setStatus] = useState<ItemStatus | undefined>();
  const [page, setPage] = useState(1);
  const query = useMyItems({
    page,
    page_size: 15,
    status,
  });

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Your activity"
        title="My reports"
        description="Track what you’ve posted and jump back into matching when something turns up."
      />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status ?? "ALL"}
          onValueChange={(value) => {
            setStatus(value === "ALL" ? undefined : (value as ItemStatus));
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
            {query.data.total} report{query.data.total === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {Array.from({ length: 5 }, (_, index) => `skeleton-${index}`).map((key) => (
              <div
                key={key}
                className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
              >
                <Skeleton className="size-14 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
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
            icon={FilePlus2}
            title={status ? "No reports with this status" : "You haven’t posted a report yet"}
            description={
              status
                ? "Try another status or view all of your reports."
                : "When something goes missing — or turns up — a clear report is the best first step."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/report/lost">
                  <Button variant="secondary">Report lost</Button>
                </Link>
                <Link to="/report/found">
                  <Button>Report found</Button>
                </Link>
              </div>
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[minmax(0,1fr)_130px_150px_150px] gap-4 border-b border-line bg-paper-deep/30 px-4 py-2.5 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase lg:grid">
                <span>Report</span>
                <span>Status</span>
                <span>Activity</span>
                <span />
              </div>
              <div className="divide-y divide-line">
                {query.data.items.map((item) => (
                  <div
                    key={item.id}
                    className="group grid gap-3 px-4 py-3.5 transition-colors hover:bg-paper-deep/25 lg:grid-cols-[minmax(0,1fr)_130px_150px_150px] lg:items-center lg:gap-4"
                  >
                    <Link
                      to="/items/$itemId"
                      params={{ itemId: item.id }}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <ItemImage
                        src={item.images?.[0]?.url}
                        alt={item.title}
                        type={item.type}
                        category={item.category}
                        showLabel={false}
                        className="size-14 shrink-0 rounded-md"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <TypeBadge type={item.type} />
                          <span className="truncate text-[0.68rem] text-muted">
                            {item.category}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-ink group-hover:text-cobalt">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-[0.68rem] text-muted">
                          {item.location} · posted {formatRelative(item.created_at)}
                        </p>
                      </div>
                    </Link>

                    <div className="flex flex-wrap items-center gap-1.5 lg:block">
                      <ItemStatusBadge status={item.status} />
                      {item.processing_status !== "READY" ? (
                        <span className="lg:mt-1.5 lg:block">
                          <ProcessingBadge status={item.processing_status} />
                        </span>
                      ) : null}
                    </div>

                    <div className="text-[0.68rem] leading-5 text-muted">
                      <p>Updated {formatRelative(item.updated_at)}</p>
                      <p>
                        {item.images?.length
                          ? `${item.images.length} photo${item.images.length === 1 ? "" : "s"}`
                          : "No photos"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 lg:justify-end">
                      <Link
                        to="/my/reports/$itemId/matches"
                        params={{ itemId: item.id }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-cobalt"
                      >
                        <Sparkles className="size-3.5" aria-hidden="true" /> Matches
                      </Link>
                      <Link
                        to="/items/$itemId"
                        params={{ itemId: item.id }}
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
