import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileClock } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listAuditLogs } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import { formatDate, formatRelative, humanizeLabel } from "@/lib/utils";

const actionOptions = [
  "CLAIM_APPROVED",
  "CLAIM_CANCELLED",
  "CLAIM_COMPLETED",
  "CLAIM_REJECTED",
  "CLAIM_SUBMITTED",
  "ITEM_CLOSED",
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "ITEM_WITHDRAWN",
  "KNOWLEDGE_DOCUMENT_CREATED",
  "KNOWLEDGE_DOCUMENT_REINDEXED",
  "MATCH_FEEDBACK",
  "USER_ROLE_CHANGED",
  "USER_STATUS_CHANGED",
];

export function AdminAuditPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      action: action || undefined,
      entity_type: entityType || undefined,
      page,
      page_size: 30,
    }),
    [action, entityType, page],
  );

  const query = useQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: () => listAuditLogs(filters),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="A chronological record of account, claim, item, and knowledge changes."
        actions={
          <Link to="/admin">
            <Button variant="secondary" leftIcon={<ArrowLeft className="size-4" />}>
              Overview
            </Button>
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by action"
          className="sm:w-64"
        >
          <option value="">All actions</option>
          {actionOptions.map((value) => (
            <option key={value} value={value}>
              {humanizeLabel(value)}
            </option>
          ))}
        </Select>
        <Select
          value={entityType}
          onChange={(event) => {
            setEntityType(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by entity type"
          className="sm:w-52"
        >
          <option value="">All entities</option>
          <option value="ITEM">Items</option>
          <option value="CLAIM">Claims</option>
          <option value="USER">Users</option>
          <option value="MATCH">Matches</option>
          <option value="KNOWLEDGE_DOCUMENT">Knowledge documents</option>
        </Select>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data?.items.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title="No audit entries match"
            description="Try clearing the filters or check back after the next action is recorded."
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[180px_1fr_160px_160px] gap-4 border-b border-line px-5 py-3 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase md:grid">
                <span>When</span>
                <span>Action</span>
                <span>Entity</span>
                <span>Actor</span>
              </div>
              <div className="divide-y divide-line">
                {query.data?.items.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid gap-2 px-4 py-4 md:grid-cols-[180px_1fr_160px_160px] md:items-start md:gap-4 md:px-5"
                  >
                    <div className="text-xs text-muted">
                      <p className="font-medium text-ink">{formatRelative(entry.created_at)}</p>
                      <p className="mt-0.5 text-[0.65rem]">{formatDate(entry.created_at)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">{humanizeLabel(entry.action)}</p>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[0.65rem] text-cobalt">
                            Details
                          </summary>
                          <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-paper-deep p-2 text-[0.62rem] leading-5 text-muted">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">
                      <p>{humanizeLabel(entry.entity_type)}</p>
                      {entry.entity_id ? (
                        <p className="mt-0.5 font-mono text-[0.6rem]">
                          #{entry.entity_id.slice(0, 8)}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">
                      {entry.actor_id ? (
                        <span className="font-mono text-[0.65rem]" title={`User ${entry.actor_id}`}>
                          User {entry.actor_id.slice(0, 8)}
                        </span>
                      ) : (
                        <span>System</span>
                      )}
                    </div>
                  </div>
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
