import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api/endpoints";
import { useNotifications } from "@/lib/api/hooks";
import type { Notification } from "@/lib/api/types";
import { cn, formatRelative } from "@/lib/utils";

function notificationTarget(notification: Notification) {
  const data = notification.data ?? {};
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : null;
  const matchId = typeof data.match_id === "string" ? data.match_id : null;
  const claimId = typeof data.claim_id === "string" ? data.claim_id : null;
  const itemId = typeof data.item_id === "string" ? data.item_id : null;

  if (notification.type === "NEW_MESSAGE" && conversationId) {
    return `/messages/${conversationId}`;
  }
  if (matchId) return `/matches/${matchId}`;
  if (claimId) return `/claims/${claimId}`;
  if (itemId) return `/items/${itemId}`;
  return null;
}

function NotificationIcon({ type }: { type: string }) {
  const map: Record<string, typeof Bell> = {
    POSSIBLE_MATCH: Sparkles,
    CLAIM_SUBMITTED: ShieldCheck,
    CLAIM_APPROVED: UserRoundCheck,
    CLAIM_REJECTED: ShieldCheck,
    HANDOVER_COMPLETED: PackageCheck,
    ITEM_RESOLVED: PackageCheck,
    NEW_MESSAGE: MessageCircle,
    SYSTEM_ANNOUNCEMENT: Bell,
  };
  const Icon = map[type] ?? Bell;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl",
        type === "POSSIBLE_MATCH" || type === "NEW_MESSAGE"
          ? "bg-cobalt-soft text-cobalt"
          : type.includes("REJECTED")
            ? "bg-lost-soft text-lost"
            : "bg-found-soft text-found",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();
  const query = useNotifications({ unread_only: unreadOnly, page_size: 30 });

  const markOne = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: toastError,
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (updated) => {
      toastSuccess(`${updated} notification${updated === 1 ? "" : "s"} marked read.`);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: toastError,
  });

  const notifications = query.data?.items ?? [];
  const hasUnread = notifications.some((notification) => !notification.read_at);

  return (
    <div className="container-page max-w-4xl py-8 sm:py-10">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Matches, claim updates, and messages in one place."
        actions={
          <Button
            variant="secondary"
            leftIcon={<CheckCheck className="size-4" />}
            isLoading={markAll.isPending}
            disabled={!hasUnread && !unreadOnly}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        }
      />

      <div className="mt-6">
        <Tabs
          value={unreadOnly ? "unread" : "all"}
          onValueChange={(value) => setUnreadOnly(value === "unread")}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? "You’re all caught up" : "Nothing here yet"}
            description={
              unreadOnly
                ? "You have no unread notifications."
                : "When there’s a match, a claim update, or a new message, it will appear here."
            }
          />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {notifications.map((notification) => {
              const target = notificationTarget(notification);
              const unread = !notification.read_at;
              const content = (
                <>
                  <NotificationIcon type={notification.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className={cn(
                          "text-sm",
                          unread ? "font-semibold text-ink" : "font-medium text-ink-soft",
                        )}
                      >
                        {notification.title}
                      </p>
                      {unread ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-cobalt" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">{notification.body}</p>
                    <p className="mt-1.5 text-[0.65rem] text-muted-soft">
                      {formatRelative(notification.created_at)}
                    </p>
                  </div>
                  {target ? <ChevronRight className="mt-2 size-4 shrink-0 text-muted" /> : null}
                </>
              );

              const onClick = () => {
                if (unread) markOne.mutate(notification.id);
              };

              return target ? (
                <Link
                  key={notification.id}
                  to={target as never}
                  onClick={onClick}
                  className="flex gap-3 px-4 py-4 transition-colors hover:bg-paper-deep/50"
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={notification.id}
                  type="button"
                  onClick={onClick}
                  className="flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-paper-deep/50"
                >
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {query.data ? (
        <p className="mt-5 text-center text-xs text-muted">
          Showing the latest {notifications.length} of {query.data.total} notifications.
        </p>
      ) : null}
    </div>
  );
}
