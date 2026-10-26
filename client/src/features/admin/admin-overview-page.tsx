import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, FileClock, ShieldCheck } from "lucide-react";

import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listAuditLogs,
  listItems,
  listKnowledgeDocuments,
  listManagerClaims,
  listUsers,
} from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import { formatRelative, humanizeLabel } from "@/lib/utils";

export function AdminOverviewPage() {
  const users = useQuery({
    queryKey: queryKeys.users({ page_size: 1 }),
    queryFn: () => listUsers({ page_size: 1 }),
    staleTime: 30_000,
  });
  const items = useQuery({
    queryKey: queryKeys.items({ page_size: 1, status: "OPEN" }),
    queryFn: () => listItems({ page_size: 1, status: "OPEN" }),
    staleTime: 30_000,
  });
  const claims = useQuery({
    queryKey: queryKeys.managerClaims({ page_size: 1, status: "PENDING" }),
    queryFn: () => listManagerClaims({ page_size: 1, status: "PENDING" }),
    staleTime: 20_000,
  });
  const knowledge = useQuery({
    queryKey: queryKeys.knowledge({ page_size: 100 }),
    queryFn: () => listKnowledgeDocuments({ page_size: 100 }),
    staleTime: 30_000,
  });
  const audit = useQuery({
    queryKey: queryKeys.audit({ page_size: 6 }),
    queryFn: () => listAuditLogs({ page_size: 6 }),
    staleTime: 20_000,
  });

  const readyDocuments = knowledge.data?.items.filter(
    (document) => document.status === "READY",
  ).length;
  const error = users.error ?? items.error ?? claims.error ?? knowledge.error ?? audit.error;

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Operations overview"
        description="Accounts, reports, review queues, and the knowledge that powers the assistant."
        actions={
          <Link to="/admin/users">
            <Button>Manage users</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mt-6">
          <ErrorState
            error={error}
            onRetry={() => {
              void users.refetch();
              void items.refetch();
              void claims.refetch();
              void knowledge.refetch();
              void audit.refetch();
            }}
          />
        </div>
      ) : null}

      <section className="mt-7 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          <Link
            to="/admin/users"
            className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30"
          >
            <p className="text-xs text-muted">Accounts</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
              {users.data?.total ?? "—"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">Registered students and staff</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
              Manage users <ArrowRight className="size-3" />
            </span>
          </Link>

          <Link to="/" className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30">
            <p className="text-xs text-muted">Open reports</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
              {items.data?.total ?? "—"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">Items still looking for a match</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
              Browse the board <ArrowRight className="size-3" />
            </span>
          </Link>

          <Link
            to="/staff/claims"
            className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30"
          >
            <p className="text-xs text-muted">Pending claims</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
              {claims.data?.total ?? "—"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">Waiting for a manager decision</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
              Open claim queue <ArrowRight className="size-3" />
            </span>
          </Link>

          <Link
            to="/admin/knowledge"
            className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30"
          >
            <p className="text-xs text-muted">Knowledge base</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
              {readyDocuments ?? "—"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">Ready for assistant answers</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
              Manage knowledge <ArrowRight className="size-3" />
            </span>
          </Link>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
              <p className="mt-0.5 text-xs text-muted">
                The latest recorded actions across the system.
              </p>
            </div>
            <Link
              to="/admin/audit"
              className="inline-flex items-center gap-1 text-xs font-semibold text-cobalt"
            >
              Full log <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="mt-4">
            {audit.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, index) => `skeleton-${index}`).map((key) => (
                  <Skeleton key={key} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : audit.data?.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
                No audit entries yet.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {audit.data?.items.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-paper-deep text-muted">
                      <FileClock className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink">
                        {humanizeLabel(entry.action)}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] text-muted">
                        {humanizeLabel(entry.entity_type)} · {formatRelative(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-cobalt-soft text-cobalt">
              <BookOpen className="size-4" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-ink">Assistant knowledge</h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              {readyDocuments ?? 0} ready document{readyDocuments === 1 ? "" : "s"}. Reindex after
              changing content or provider settings.
            </p>
            <Link
              to="/admin/knowledge"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cobalt"
            >
              Manage knowledge <ArrowRight className="size-3" />
            </Link>
          </Card>
          <Card className="p-5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-found-soft text-found">
              <ShieldCheck className="size-4" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-ink">Trust & safety</h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Review claim evidence carefully and keep personal details out of public item
              descriptions.
            </p>
            <Link
              to="/staff/claims"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cobalt"
            >
              Open claim queue <ArrowRight className="size-3" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
