import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, MessageCircle, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { ItemImage } from "@/components/items/item-image";
import { MatchStatusBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { feedbackMatch } from "@/lib/api/endpoints";
import { useItem, useMatch } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import type { Item } from "@/lib/api/types";
import { formatDate, formatRelative, formatScore, shortId } from "@/lib/utils";

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  const percent = Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-ink">{formatScore(value)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-deep">
        <div
          className="h-full rounded-full bg-cobalt transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function MatchItemPanel({ item, side }: { item: Item | undefined; side: "LOST" | "FOUND" }) {
  if (!item) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-sm text-muted">
        This report is unavailable.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <ItemImage
        src={item.images?.[0]?.url}
        alt={item.title}
        type={side}
        className="aspect-[16/9] w-full bg-surface"
        imageClassName="object-contain"
      />
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={item.type} />
          <span className="font-mono text-[0.62rem] text-muted-soft">#{shortId(item.id)}</span>
        </div>
        <h3 className="mt-2 text-base font-semibold tracking-[-0.02em] text-ink">{item.title}</h3>
        <p className="mt-1 text-xs text-muted">
          {item.location} ·{" "}
          {item.occurred_at ? formatDate(item.occurred_at) : formatDate(item.created_at)}
        </p>
        <Link
          to="/items/$itemId"
          params={{ itemId: item.id }}
          className="mt-3 inline-flex text-xs font-semibold text-cobalt hover:underline"
        >
          Open report
        </Link>
      </div>
    </div>
  );
}

export function MatchDetailPage() {
  const { matchId } = useParams({ strict: false }) as { matchId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const matchQuery = useMatch(matchId);
  const match = matchQuery.data;
  const lostQuery = useItem(match?.lost_item_id ?? "");
  const foundQuery = useItem(match?.found_item_id ?? "");
  const [rejectOpen, setRejectOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (status: "CONFIRMED" | "REJECTED") => feedbackMatch(matchId, status),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.match(matchId), updated);
      void queryClient.invalidateQueries({ queryKey: ["item-matches"] });
      toastSuccess(
        updated.status === "CONFIRMED" ? "Match confirmed." : "Thanks — we’ll use that feedback.",
      );
      setRejectOpen(false);
    },
    onError: toastError,
  });

  if (matchQuery.isLoading) {
    return (
      <div className="container-page space-y-5 py-10">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="aspect-[16/10] w-full rounded-[var(--radius-card)]" />
          <Skeleton className="aspect-[16/10] w-full rounded-[var(--radius-card)]" />
        </div>
      </div>
    );
  }

  if (matchQuery.isError || !match) {
    return (
      <div className="container-page py-12">
        <ErrorState
          error={matchQuery.error ?? new Error("Match not found.")}
          onRetry={() => void matchQuery.refetch()}
        />
      </div>
    );
  }

  const actionable = match.status === "PENDING" || match.status === "NOTIFIED";
  const ownedItem = [lostQuery.data, foundQuery.data].find((item) => item?.is_owner);
  const counterpart = ownedItem?.id === lostQuery.data?.id ? foundQuery.data : lostQuery.data;

  return (
    <div className="container-page py-8 sm:py-10">
      <button
        type="button"
        onClick={() => void navigate({ to: "/" })}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to the board
      </button>

      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-cobalt">Match detail</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
            Is this the same item?
          </h1>
          <p className="mt-2 text-sm text-muted">
            Compare the reports carefully. A match is only a suggestion until someone confirms it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MatchStatusBadge status={match.status} />
          <span className="font-mono text-[0.68rem] text-muted-soft">#{shortId(match.id)}</span>
        </div>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <MatchItemPanel item={lostQuery.data} side="LOST" />
        <MatchItemPanel item={foundQuery.data} side="FOUND" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-cobalt" />
            <h2 className="text-sm font-semibold text-ink">Why this matched</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            These signals compare the words, details, and photos in both reports. They are clues,
            not a decision.
          </p>
          <div className="mt-5 space-y-4">
            <ScoreBar label="Text similarity" value={match.text_score} />
            <ScoreBar label="Image similarity" value={match.image_score} />
            <ScoreBar label="Attributes" value={match.attribute_score} />
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <div>
              <span className="text-sm font-medium text-ink">Overall score</span>
              <p className="mt-0.5 text-[0.68rem] text-muted">
                Weighted combination of these signals
              </p>
            </div>
            <span className="text-2xl font-semibold tracking-[-0.03em] text-ink">
              {formatScore(match.final_score)}
            </span>
          </div>
          <p className="mt-3 text-[0.68rem] leading-5 text-muted">
            Generated {formatRelative(match.created_at)} · model{" "}
            <span className="font-mono">{match.model_version}</span>
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">What happens next</h2>
          {actionable ? (
            <>
              <p className="mt-2 text-xs leading-5 text-muted">
                If these are the same item, confirm the match. If not, reject it so we can improve
                future suggestions.
              </p>
              <div className="mt-4 space-y-2">
                <Button
                  className="w-full"
                  leftIcon={<Check className="size-4" />}
                  isLoading={mutation.isPending && mutation.variables === "CONFIRMED"}
                  onClick={() => mutation.mutate("CONFIRMED")}
                >
                  Confirm this match
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  leftIcon={<X className="size-4" />}
                  onClick={() => setRejectOpen(true)}
                >
                  Not the same item
                </Button>
              </div>
            </>
          ) : match.status === "CONFIRMED" ? (
            <>
              <p className="mt-2 text-xs leading-5 text-muted">
                This match was confirmed. If the item is yours, open the other report to start a
                claim or coordinate the handover.
              </p>
              {counterpart ? (
                <Link
                  to="/items/$itemId"
                  params={{ itemId: counterpart.id }}
                  className="mt-4 block"
                >
                  <Button className="w-full" leftIcon={<MessageCircle className="size-4" />}>
                    Open the other report
                  </Button>
                </Link>
              ) : null}
              <Link to="/messages" className="mt-2 block">
                <Button variant="secondary" className="w-full">
                  Go to messages
                </Button>
              </Link>
            </>
          ) : match.status === "REJECTED" ? (
            <p className="mt-2 text-xs leading-5 text-muted">
              This match was marked as not the same item. We’ll keep looking for better suggestions.
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted">
              This match is no longer active. Browse the board or check your report for newer
              suggestions.
            </p>
          )}
          {ownedItem ? (
            <Link
              to="/my/reports/$itemId/matches"
              params={{ itemId: ownedItem.id }}
              className="mt-4 inline-flex text-xs font-semibold text-cobalt hover:underline"
            >
              View all matches for your report
            </Link>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Not the same item?"
        description="This feedback helps improve future suggestions. You can’t undo it."
        confirmLabel="Reject match"
        isLoading={mutation.isPending && mutation.variables === "REJECTED"}
        onConfirm={() => mutation.mutate("REJECTED")}
      />
    </div>
  );
}
