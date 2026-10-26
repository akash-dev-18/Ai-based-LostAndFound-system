import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ItemImage } from "@/components/items/item-image";
import { PageHeader } from "@/components/layout/page-header";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagerClaims } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/use-auth";
import { formatRelative } from "@/lib/utils";

export function StaffOverviewPage() {
  const { isAdmin, user } = useAuth();
  const pendingQuery = useManagerClaims({ status: "PENDING", page_size: 5 });

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Staff workspace"
        title={`Good to see you, ${user?.name?.split(" ")[0] ?? "there"}.`}
        description="Review claims, keep the board tidy, and help items get home."
        actions={
          <Link to="/staff/claims">
            <Button leftIcon={<ClipboardCheck className="size-4" />}>Open claim queue</Button>
          </Link>
        }
      />

      <section className="mt-7 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div
          className={
            isAdmin
              ? "grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4"
              : "grid gap-px bg-line sm:grid-cols-3"
          }
        >
          <Link
            to="/staff/claims"
            className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30"
          >
            <p className="text-xs text-muted">Pending claims</p>
            <div className="mt-2 flex items-end gap-3">
              <p className="text-3xl font-semibold tracking-[-0.04em] text-ink">
                {pendingQuery.data?.total ?? "—"}
              </p>
              <p className="pb-1 text-xs text-muted">waiting for review</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
              Open claim queue <ArrowRight className="size-3" />
            </span>
          </Link>

          <Link
            to="/staff/items"
            className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30"
          >
            <p className="text-xs text-muted">Reports</p>
            <p className="mt-2 text-base font-semibold text-ink">Manage the board</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Review, close, or moderate any lost and found report.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
              Review reports <ArrowRight className="size-3" />
            </span>
          </Link>

          <div className="bg-surface p-5">
            <p className="text-xs text-muted">Matching</p>
            <p className="mt-2 text-base font-semibold text-ink">Owner-reviewed suggestions</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Possible matches are shown to the report owner. Staff verify claims before handover.
            </p>
          </div>

          {isAdmin ? (
            <Link
              to="/admin"
              className="group bg-surface p-5 transition-colors hover:bg-paper-deep/30"
            >
              <p className="text-xs text-muted">Admin tools</p>
              <p className="mt-2 text-base font-semibold text-ink">Accounts and audit</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Manage access, review audit entries, and maintain the assistant knowledge base.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cobalt">
                Open admin <ArrowRight className="size-3" />
              </span>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="mt-9">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
              Waiting for review
            </h2>
            <p className="mt-1 text-sm text-muted">The newest pending claims.</p>
          </div>
          <Link to="/staff/claims" className="text-xs font-semibold text-cobalt hover:underline">
            View queue
          </Link>
        </div>

        <div className="mt-4">
          {pendingQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => `skeleton-${index}`).map((key) => (
                <Skeleton key={key} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : pendingQuery.isError ? (
            <ErrorState error={pendingQuery.error} onRetry={() => void pendingQuery.refetch()} />
          ) : pendingQuery.data?.items.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No claims waiting"
              description="The queue is clear. New claims will appear here as they arrive."
            />
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {pendingQuery.data?.items.map((claim) => (
                <Link
                  key={claim.id}
                  to="/staff/claims/$claimId"
                  params={{ claimId: claim.id }}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-paper-deep/50"
                >
                  <ItemImage
                    src={claim.item_image_url}
                    alt={claim.item_title ?? "Claimed item"}
                    type={claim.item_type ?? undefined}
                    showLabel={false}
                    className="size-12 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {claim.item_title ?? "Claimed item"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {claim.claimant_name ?? "Unknown claimant"} ·{" "}
                      {formatRelative(claim.created_at)}
                    </p>
                  </div>
                  <ClaimStatusBadge status={claim.status} />
                  <ArrowRight className="size-4 text-muted" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
