import { Link } from "@tanstack/react-router";
import { MessageCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "@/lib/api/hooks";
import type { Conversation } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/use-auth";
import { formatRelative } from "@/lib/utils";

function participantLabel(conversation: Conversation, currentUserId: string | undefined) {
  const others = conversation.participants?.filter(
    (participant) => participant.user_id !== currentUserId,
  );
  if (others && others.length > 0) return others.map((participant) => participant.name).join(", ");
  return "Conversation";
}

export function ConversationsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const conversationsQuery = useConversations(1);

  const conversations = useMemo(() => {
    const items = conversationsQuery.data?.items ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((conversation) =>
      participantLabel(conversation, user?.id).toLowerCase().includes(normalized),
    );
  }, [conversationsQuery.data?.items, query, user?.id]);

  return (
    <div className="container-page max-w-3xl py-8 sm:py-10">
      <PageHeader
        eyebrow="Messages"
        title="Conversations"
        description="Coordinate handovers and claim questions without leaving Found."
        actions={
          <Link to="/claims">
            <Button variant="secondary">View claims</Button>
          </Link>
        }
      />

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
          className="pl-10"
          aria-label="Search conversations"
        />
      </div>

      <div className="mt-5">
        {conversationsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : conversationsQuery.isError ? (
          <ErrorState
            error={conversationsQuery.error}
            onRetry={() => void conversationsQuery.refetch()}
          />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={query ? "No conversations match" : "No conversations yet"}
            description={
              query
                ? "Try a different name."
                : "When a claim is approved or a match is confirmed, you can start a conversation here."
            }
          />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {conversations.map((conversation) => {
              const label = participantLabel(conversation, user?.id);
              const other = conversation.participants?.find(
                (participant) => participant.user_id !== user?.id,
              );
              return (
                <Link
                  key={conversation.id}
                  to="/messages/$conversationId"
                  params={{ conversationId: conversation.id }}
                  className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-paper-deep/50"
                >
                  <Avatar name={other?.name ?? label} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-ink">{label}</p>
                      <span className="shrink-0 text-[0.65rem] text-muted">
                        {formatRelative(conversation.updated_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="truncate text-xs text-muted">
                        {conversation.type === "SUPPORT"
                          ? "Support conversation"
                          : conversation.claim_id
                            ? "About a claim"
                            : conversation.match_id
                              ? "About a possible match"
                              : "Direct conversation"}
                      </p>
                      {conversation.unread_count > 0 ? (
                        <Badge tone="open" className="min-w-6 justify-center">
                          {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
