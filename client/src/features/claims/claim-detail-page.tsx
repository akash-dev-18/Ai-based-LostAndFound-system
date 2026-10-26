import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Clock3, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { ItemImage } from "@/components/items/item-image";
import { ClaimStatusBadge, ItemStatusBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import {
  approveClaim,
  completeHandover,
  createConversation,
  rejectClaim,
} from "@/lib/api/endpoints";
import { useClaim, useItem } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import { cn, formatDate, formatRelative, shortId } from "@/lib/utils";

type Action = "approve" | "reject" | "complete" | null;

const STEPS = [
  { key: "submitted", label: "Claim sent", text: "Your proof was sent to the team." },
  { key: "review", label: "Manager review", text: "A manager checks the details." },
  { key: "handover", label: "Handover", text: "Meet safely and confirm the return." },
];

export function ClaimDetailPage({ mode = "user" }: { mode?: "user" | "staff" }) {
  const { claimId } = useParams({ strict: false }) as { claimId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const claimQuery = useClaim(claimId);
  const claim = claimQuery.data;
  const itemQuery = useItem(claim?.item_id ?? "");
  const item = itemQuery.data;
  const [action, setAction] = useState<Action>(null);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.claim(claimId) });
    void queryClient.invalidateQueries({ queryKey: ["manager-claims"] });
    void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
    void queryClient.invalidateQueries({ queryKey: ["items"] });
    if (claim?.item_id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.item(claim.item_id) });
    }
  };

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("No action selected.");
      if (action === "approve") return approveClaim(claimId, notes.trim() || undefined);
      if (action === "reject") return rejectClaim(claimId, notes.trim());
      return completeHandover(claimId, notes.trim() || undefined);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.claim(claimId), updated);
      toastSuccess(
        updated.status === "APPROVED"
          ? "Claim approved."
          : updated.status === "REJECTED"
            ? "Claim rejected."
            : "Handover marked complete.",
      );
      setAction(null);
      setNotes("");
      refresh();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const messageMutation = useMutation({
    mutationFn: () => createConversation({ type: "DIRECT", claim_id: claimId }),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void navigate({
        to: "/messages/$conversationId",
        params: { conversationId: conversation.id },
      });
    },
    onError: toastError,
  });

  if (claimQuery.isLoading) {
    return (
      <div className="container-page space-y-5 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (claimQuery.isError || !claim) {
    return (
      <div className="container-page py-12">
        <ErrorState
          error={claimQuery.error ?? new Error("Claim not found.")}
          onRetry={() => void claimQuery.refetch()}
        />
      </div>
    );
  }

  const status = claim.status;
  const isFinal = status === "COMPLETED" || status === "REJECTED" || status === "CANCELLED";
  const isApproved = status === "APPROVED" || status === "COMPLETED";
  const completedSteps =
    status === "PENDING"
      ? 1
      : status === "APPROVED"
        ? 2
        : status === "COMPLETED"
          ? 3
          : status === "REJECTED" || status === "CANCELLED"
            ? 1
            : 0;
  const activeStep = status === "PENDING" ? 1 : status === "APPROVED" ? 2 : null;

  return (
    <div className="container-page max-w-5xl py-8 sm:py-10">
      <Link
        to={mode === "staff" ? "/staff/claims" : "/claims"}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />{" "}
        {mode === "staff" ? "Back to claim queue" : "Back to claims"}
      </Link>

      <div className="mt-5 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-cobalt">
            {mode === "staff" ? "Staff review" : "Claim detail"}
          </p>
          <h1 className="mt-2 text-balance text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl">
            {claim.item_title ?? "Claimed item"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <ClaimStatusBadge status={status} />
            {claim.item_type ? <TypeBadge type={claim.item_type} /> : null}
            {claim.item_status ? <ItemStatusBadge status={claim.item_status} /> : null}
            <span className="font-mono text-[0.65rem]">#{shortId(claim.id)}</span>
          </div>
        </div>
        {mode === "staff" ? (
          <div className="flex flex-wrap gap-2">
            {status === "PENDING" ? (
              <>
                <Button
                  size="sm"
                  leftIcon={<CheckCircle2 className="size-3.5" />}
                  onClick={() => {
                    setActionError(null);
                    setAction("approve");
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger-soft"
                  leftIcon={<XCircle className="size-3.5" />}
                  onClick={() => {
                    setActionError(null);
                    setAction("reject");
                  }}
                >
                  Reject
                </Button>
              </>
            ) : status === "APPROVED" ? (
              <Button
                size="sm"
                leftIcon={<ShieldCheck className="size-3.5" />}
                onClick={() => {
                  setActionError(null);
                  setAction("complete");
                }}
              >
                Complete handover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
        <div className="space-y-5">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Claim message</h2>
            <p className="mt-3 text-sm leading-6 whitespace-pre-line text-ink-soft">
              {claim.message}
            </p>
            <p className="mt-4 border-t border-line pt-3 text-[0.68rem] text-muted">
              Sent {formatDate(claim.created_at)}
              {claim.claimant_name ? ` by ${claim.claimant_name}` : ""}
            </p>
          </div>

          {claim.resolution_notes ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Review notes</h2>
              <p className="mt-3 text-sm leading-6 whitespace-pre-line text-ink-soft">
                {claim.resolution_notes}
              </p>
              {claim.reviewed_at ? (
                <p className="mt-3 text-[0.68rem] text-muted">
                  Reviewed {formatDate(claim.reviewed_at)}
                </p>
              ) : null}
            </div>
          ) : null}

          {isApproved && mode === "user" ? (
            <div className="rounded-[var(--radius-card)] border border-found/15 bg-found-soft/60 p-5">
              <h2 className="text-sm font-semibold text-found">Your claim was approved</h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                Coordinate a safe handover with the person who has the item. Keep the conversation
                inside Found.
              </p>
              <Button
                className="mt-4"
                size="sm"
                leftIcon={<MessageCircle className="size-4" />}
                isLoading={messageMutation.isPending}
                onClick={() => messageMutation.mutate()}
              >
                Message about this claim
              </Button>
            </div>
          ) : null}

          {status === "PENDING" && mode === "user" ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock3 className="size-4 text-pending" /> Waiting for review
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                A manager will compare your claim with the report. You’ll get a notification when
                there’s an update.
              </p>
            </div>
          ) : null}

          {status === "REJECTED" && mode === "user" ? (
            <div className="rounded-[var(--radius-card)] border border-danger/15 bg-danger-soft/60 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-danger">
                <XCircle className="size-4" /> This claim was not approved
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                If you think this was a mistake, contact the lost & found desk with more proof.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <ItemImage
                src={claim.item_image_url}
                alt={claim.item_title ?? "Claimed item"}
                type={claim.item_type ?? undefined}
                showLabel={false}
                className="size-16 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-ink">
                  {claim.item_title ?? "Item"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {item
                    ? `${item.location} · ${item.category}`
                    : "Open the report for full details."}
                </p>
                <Link
                  to="/items/$itemId"
                  params={{ itemId: claim.item_id }}
                  className="mt-2 inline-flex text-xs font-semibold text-cobalt hover:underline"
                >
                  Open item report
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Progress</h2>
            <ol className="mt-4 space-y-4">
              {STEPS.map((step, index) => {
                const done = index < completedSteps;
                const active = index === activeStep;
                const failed = status === "REJECTED" && index === 1;
                return (
                  <li key={step.key} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold",
                        failed
                          ? "border-danger/20 bg-danger-soft text-danger"
                          : done
                            ? "border-found/20 bg-found-soft text-found"
                            : active
                              ? "border-cobalt/20 bg-cobalt-soft text-cobalt"
                              : "border-line bg-paper-deep text-muted",
                      )}
                    >
                      {failed ? "×" : done ? "✓" : index + 1}
                    </span>
                    <div>
                      <p
                        className={cn("text-xs font-semibold", active ? "text-cobalt" : "text-ink")}
                      >
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-[0.68rem] leading-5 text-muted">{step.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {isFinal ? (
              <p className="mt-4 border-t border-line pt-3 text-[0.68rem] text-muted">
                This claim is closed. Reviewed{" "}
                {formatRelative(claim.reviewed_at ?? claim.updated_at)}.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent
          title={
            action === "approve"
              ? "Approve this claim?"
              : action === "reject"
                ? "Reject this claim?"
                : "Complete the handover?"
          }
          description={
            action === "approve"
              ? "Approving moves the item to claim pending and notifies both people."
              : action === "reject"
                ? "Explain why the proof was not sufficient. This note is shared with the claimant."
                : "Confirm that the item has been returned. This resolves the report."
          }
        >
          <div className="space-y-4">
            {actionError ? (
              <p className="rounded-lg border border-danger/15 bg-danger-soft px-3 py-2 text-xs text-danger">
                {actionError}
              </p>
            ) : null}
            <Field
              label="Review notes"
              htmlFor="resolution-notes"
              hint={action === "reject" ? "Required" : "Optional"}
            >
              <Textarea
                id="resolution-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={
                  action === "reject"
                    ? "e.g. The description did not match the item’s unique markings."
                    : "Add a note for the claimant and reporter."
                }
                rows={4}
                autoFocus
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant={action === "reject" ? "danger" : "primary"}
                isLoading={actionMutation.isPending}
                disabled={action === "reject" && notes.trim().length < 3}
                onClick={() => {
                  setActionError(null);
                  actionMutation.mutate();
                }}
              >
                {action === "approve"
                  ? "Approve claim"
                  : action === "reject"
                    ? "Reject claim"
                    : "Complete handover"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
