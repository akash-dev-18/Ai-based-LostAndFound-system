import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { ProcessingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useItem, useItemMatches } from "@/lib/api/hooks";
import type { MatchStatus } from "@/lib/api/types";
import { formatRelative } from "@/lib/utils";

import { MatchCard } from "./match-card";

const TABS: { value: MatchStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "New" },
  { value: "NOTIFIED", label: "Notified" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "REJECTED", label: "Not a match" },
];

export function ItemMatchesPage() {
  const { itemId } = useParams({ strict: false }) as { itemId: string };
  const [status, setStatus] = useState<MatchStatus | undefined>();
  const [page, setPage] = useState(1);
  const itemQuery = useItem(itemId);
  const matchesQuery = useItemMatches(itemId, { status, page, page_size: 10 });

  if (itemQuery.isLoading) {
    return (
      <div className="container-page space-y-4 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (itemQuery.isError || !itemQuery.data) {
    return (
      <div className="container-page py-12">
        <ErrorState
          error={itemQuery.error ?? new Error("Report not found.")}
          onRetry={() => void itemQuery.refetch()}
        />
      </div>
    );
  }

  const item = itemQuery.data;

  return (
    <div className="container-page py-8 sm:py-10">
      <Link
        to="/items/$itemId"
        params={{ itemId }}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to report
      </Link>
      <PageHeader
        eyebrow="Smart matching"
        title="Possible matches"
        description={`Reports that look similar to “${item.title}”. Matching is a suggestion — always confirm the details.`}
        actions={<ProcessingBadge status={item.processing_status} />}
      />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status ?? "ALL"}
          onValueChange={(value) => {
            setStatus(value === "ALL" ? undefined : (value as MatchStatus));
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
        {matchesQuery.data ? (
          <p className="text-xs text-muted">
            {matchesQuery.data.total} match{matchesQuery.data.total === 1 ? "" : "es"}
          </p>
        ) : null}
      </div>

      {item.processing_status !== "READY" ? (
        <div className="mt-5 rounded-[var(--radius-control)] border border-pending/15 bg-pending-soft/60 px-4 py-3 text-xs leading-5 text-pending">
          This report is still being indexed for matching. Check back shortly for suggestions.
        </div>
      ) : null}

      <div className="mt-6">
        {matchesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-28 w-full rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : matchesQuery.isError ? (
          <ErrorState error={matchesQuery.error} onRetry={() => void matchesQuery.refetch()} />
        ) : matchesQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={status ? "No matches with this status" : "No matches yet"}
            description={
              status
                ? "Try another status to see the rest of your suggestions."
                : "We’ll keep checking new reports. You can also browse the board and look for familiar details."
            }
            action={
              <Link to="/">
                <Button variant="secondary">Browse the board</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-3">
              {matchesQuery.data?.items.map((match) => (
                <MatchCard key={match.id} match={match} ownedItemId={itemId} />
              ))}
            </div>
            <div className="mt-8">
              <Pagination
                page={matchesQuery.data?.page ?? 1}
                pages={matchesQuery.data?.pages ?? 1}
                total={matchesQuery.data?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-10 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">How matching works</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
            Matches compare text, attributes, and photos. A high score is a hint, not proof — open a
            match to compare both reports.
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted">
          Last checked {formatRelative(new Date(matchesQuery.dataUpdatedAt))}
        </p>
      </div>
    </div>
  );
}
