import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Flag,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { ImageGallery } from "@/components/items/image-gallery";
import { ItemCard } from "@/components/items/item-card";
import {
  ClaimStatusBadge,
  ItemStatusBadge,
  ProcessingBadge,
  TypeBadge,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { closeItem, submitClaim, withdrawItem } from "@/lib/api/endpoints";
import { useItem, useItems, useMyClaims } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/use-auth";
import { formatDate, formatRelative, shortId } from "@/lib/utils";

export function ItemDetailPage() {
  const { itemId } = useParams({ strict: false }) as { itemId: string };
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const itemQuery = useItem(itemId);
  const item = itemQuery.data;
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const myClaimsQuery = useMyClaims(
    { item_id: itemId, page_size: 5 },
    { enabled: Boolean(isAuthenticated && item && !item.is_owner) },
  );
  const myClaim = myClaimsQuery.data?.items[0];

  const similarQuery = useItems({
    type: item?.type === "LOST" ? "FOUND" : "LOST",
    category: item?.category,
    page_size: 4,
  });

  const claimMutation = useMutation({
    mutationFn: () => submitClaim(itemId, claimMessage.trim()),
    onSuccess: (claim) => {
      toastSuccess("Claim sent. A manager will review it shortly.");
      setClaimOpen(false);
      setClaimMessage("");
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) });
      void navigate({ to: "/claims/$claimId", params: { claimId: claim.id } });
    },
    onError: (error) => setClaimError(errorMessage(error)),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeItem(itemId),
    onSuccess: () => {
      toastSuccess("Report closed.");
      setCloseOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) });
      void queryClient.invalidateQueries({ queryKey: ["my-items"] });
    },
    onError: toastError,
  });

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawItem(itemId),
    onSuccess: () => {
      toastSuccess("Report withdrawn.");
      void queryClient.invalidateQueries({ queryKey: ["my-items"] });
      void navigate({ to: "/my/reports" });
    },
    onError: toastError,
  });

  if (itemQuery.isLoading) {
    return (
      <div className="container-page py-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-12 w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (itemQuery.isError || !item) {
    return (
      <div className="container-page py-12">
        <ErrorState
          error={itemQuery.error ?? new Error("This report could not be found.")}
          title="Report not found"
          onRetry={() => void itemQuery.refetch()}
        />
      </div>
    );
  }

  const isOwner = item.is_owner;
  const canClaim =
    isAuthenticated && !isOwner && item.type === "FOUND" && item.status === "OPEN" && !myClaim;

  const loginForClaim = () => {
    window.location.assign(`/login?redirect=${encodeURIComponent(`/items/${item.id}`)}`);
  };

  return (
    <div className="container-page py-6 sm:py-8">
      <button
        type="button"
        onClick={() => void navigate({ to: "/" })}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to the board
      </button>

      <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
        <div className="page-enter">
          <ImageGallery images={item.images ?? []} title={item.title} type={item.type} />
        </div>

        <div className="page-enter">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={item.type} />
            <ItemStatusBadge status={item.status} />
            {isOwner ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-cobalt/15 bg-cobalt-soft px-2 py-0.5 text-[0.68rem] font-semibold text-cobalt-deep">
                <ShieldCheck className="size-3" /> Your report
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl">
            {item.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" /> {item.location}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" /> {formatRelative(item.created_at)}
            </span>
            <span className="font-mono text-[0.68rem] tracking-wide text-muted-soft">
              #{shortId(item.id)}
            </span>
          </div>

          <p className="mt-6 text-pretty text-[0.95rem] leading-7 whitespace-pre-line text-ink-soft">
            {item.description}
          </p>

          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
            <div className="bg-surface p-3.5">
              <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
                Category
              </dt>
              <dd className="mt-1.5 text-sm font-medium text-ink">{item.category}</dd>
            </div>
            <div className="bg-surface p-3.5">
              <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
                Last seen / found
              </dt>
              <dd className="mt-1.5 text-sm font-medium text-ink">
                {item.occurred_at ? formatDate(item.occurred_at) : "Not specified"}
              </dd>
            </div>
            <div className="bg-surface p-3.5">
              <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
                Posted
              </dt>
              <dd className="mt-1.5 text-sm font-medium text-ink">{formatDate(item.created_at)}</dd>
            </div>
            {item.brand ? (
              <div className="bg-surface p-3.5">
                <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
                  Brand
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-ink">{item.brand}</dd>
              </div>
            ) : null}
            {item.color ? (
              <div className="bg-surface p-3.5">
                <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
                  Color
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-ink">{item.color}</dd>
              </div>
            ) : null}
            {isOwner ? (
              <div className="bg-surface p-3.5">
                <dt className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
                  Search status
                </dt>
                <dd className="mt-1.5">
                  <ProcessingBadge status={item.processing_status} />
                </dd>
              </div>
            ) : null}
          </dl>

          {myClaim ? (
            <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink">You already claimed this item</p>
                  <p className="mt-1 text-xs text-muted">
                    Sent {formatRelative(myClaim.created_at)}
                  </p>
                </div>
                <ClaimStatusBadge status={myClaim.status} />
              </div>
              <Link
                to="/claims/$claimId"
                params={{ claimId: myClaim.id }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cobalt hover:underline"
              >
                View claim <ChevronRight className="size-3" />
              </Link>
            </div>
          ) : null}

          <div className="mt-7 flex flex-col gap-2.5">
            {isOwner ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link to="/my/reports/$itemId/edit" params={{ itemId: item.id }}>
                    <Button
                      variant="secondary"
                      className="w-full"
                      leftIcon={<Edit3 className="size-4" />}
                    >
                      Edit report
                    </Button>
                  </Link>
                  <Link to="/my/reports/$itemId/matches" params={{ itemId: item.id }}>
                    <Button className="w-full" leftIcon={<Sparkles className="size-4" />}>
                      View matches
                    </Button>
                  </Link>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    className="w-full"
                    leftIcon={<CheckCircle2 className="size-4" />}
                    onClick={() => setCloseOpen(true)}
                    disabled={item.status === "CLOSED" || item.status === "RESOLVED"}
                  >
                    Close report
                  </Button>
                  <Button
                    variant="danger-soft"
                    className="w-full"
                    leftIcon={<Trash2 className="size-4" />}
                    onClick={() => setWithdrawOpen(true)}
                    disabled={item.status === "CLOSED"}
                  >
                    Withdraw
                  </Button>
                </div>
              </>
            ) : item.type === "FOUND" ? (
              canClaim ? (
                <Button
                  size="lg"
                  className="w-full"
                  leftIcon={<MessageCircle className="size-4" />}
                  onClick={() => {
                    setClaimError(null);
                    setClaimOpen(true);
                  }}
                >
                  This is mine — send a claim
                </Button>
              ) : !isAuthenticated ? (
                <Button
                  size="lg"
                  className="w-full"
                  leftIcon={<MessageCircle className="size-4" />}
                  onClick={loginForClaim}
                >
                  Sign in to claim this item
                </Button>
              ) : (
                <div className="rounded-[var(--radius-control)] border border-line bg-paper-deep/60 px-4 py-3 text-center text-xs text-muted">
                  This item is no longer accepting claims.
                </div>
              )
            ) : (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-ink">Did you find this?</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Post a found report with the same details. The owner can then find and claim it.
                </p>
                <Link to="/report/found" className="mt-3 inline-flex">
                  <Button size="sm" variant="secondary" leftIcon={<Flag className="size-3.5" />}>
                    Report a found item
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {isOwner && item.processing_status !== "READY" ? (
            <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-pending/15 bg-pending-soft/60 px-4 py-3 text-xs leading-5 text-pending">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              Search indexing is still in progress. Matches may appear once processing finishes.
            </div>
          ) : null}

          <div className="mt-6 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 text-xs leading-5 text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-found" />
            Keep handovers on campus and in public. Never share payment details or personal
            documents in a report.
          </div>
        </div>
      </div>

      {similarQuery.data?.items.length ? (
        <section className="mt-14 border-t border-line pt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-cobalt">Keep looking</p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.025em] text-ink">
                Similar {item.type === "LOST" ? "found" : "lost"} reports
              </h2>
            </div>
            <Link to="/" className="text-xs font-semibold text-cobalt hover:underline">
              Browse all
            </Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similarQuery.data.items
              .filter((entry) => entry.id !== item.id)
              .slice(0, 4)
              .map((entry) => (
                <ItemCard key={entry.id} item={entry} />
              ))}
          </div>
        </section>
      ) : null}

      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent
          title="Send a claim"
          description="Tell the team how you can prove this is yours. Keep it specific and avoid sensitive document numbers."
        >
          <div className="space-y-4">
            {claimError ? (
              <div className="rounded-lg border border-danger/15 bg-danger-soft px-3 py-2 text-xs text-danger">
                {claimError}
              </div>
            ) : null}
            <Field label="Why is this yours?" htmlFor="claim-message" required>
              <Textarea
                id="claim-message"
                value={claimMessage}
                onChange={(event) => setClaimMessage(event.target.value)}
                placeholder="e.g. It has a small scratch on the back and a sticker inside the lid."
                maxLength={2000}
                autoFocus
              />
            </Field>
            <p className="text-[0.7rem] text-muted">
              {claimMessage.trim().length}/2000 characters. A manager will review your claim.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setClaimOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => claimMutation.mutate()}
                isLoading={claimMutation.isPending}
                disabled={claimMessage.trim().length < 10}
              >
                Send claim
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close this report?"
        description="Closing marks the report as finished. You can still view it in your reports."
        confirmLabel="Close report"
        tone="primary"
        isLoading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate()}
      />

      <ConfirmDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        title="Withdraw this report?"
        description="The report will be removed from the public board. This cannot be undone."
        confirmLabel="Withdraw report"
        isLoading={withdrawMutation.isPending}
        onConfirm={() => withdrawMutation.mutate()}
      >
        {withdrawMutation.isError ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {errorMessage(withdrawMutation.error)}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
