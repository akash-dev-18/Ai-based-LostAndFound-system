import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp, LoaderCircle, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { toastError } from "@/components/feedback/toast";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { listMessages, markConversationRead, sendMessage } from "@/lib/api/endpoints";
import { useConversation, useMessages } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import type { Message, MessagePage } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/use-auth";
import { useConversationSocket } from "@/lib/realtime/use-conversation-socket";
import { cn, formatDate, formatRelative } from "@/lib/utils";

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ConversationPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId: string };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const conversationQuery = useConversation(conversationId);
  const messagesQuery = useMessages(conversationId);
  const socketStatus = useConversationSocket(conversationId);
  const [draft, setDraft] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMarkedRef = useRef(0);

  const conversation = conversationQuery.data;
  const other = conversation?.participants?.find((participant) => participant.user_id !== user?.id);
  const otherName = other?.name ?? "Conversation";
  const messages = messagesQuery.data?.items ?? [];
  const hasOlder = messagesQuery.data?.has_more ?? false;

  useEffect(() => {
    if (!messages.length) return;
    if (lastMarkedRef.current >= messages.length) return;
    lastMarkedRef.current = messages.length;
    void markConversationRead(conversationId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .catch(() => undefined);
  }, [conversationId, messages.length, queryClient]);

  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: ({ content, clientMessageId }: { content: string; clientMessageId: string }) =>
      sendMessage(conversationId, content, clientMessageId),
    onMutate: async ({ content, clientMessageId }) => {
      setSendError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.messages(conversationId) });
      const previous = queryClient.getQueryData<MessagePage>(queryKeys.messages(conversationId));
      const optimistic: Message = {
        id: `pending-${clientMessageId}`,
        conversation_id: conversationId,
        sender_id: user?.id ?? "",
        client_message_id: clientMessageId,
        content,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };
      queryClient.setQueryData<MessagePage>(queryKeys.messages(conversationId), (current) =>
        current ? { ...current, items: [...current.items, optimistic] } : current,
      );
      return { previous, clientMessageId };
    },
    onSuccess: (message, _variables, context) => {
      queryClient.setQueryData<MessagePage>(queryKeys.messages(conversationId), (current) => {
        if (!current) return current;
        const withoutPending = current.items.filter(
          (entry) => entry.id !== `pending-${context?.clientMessageId}`,
        );
        if (withoutPending.some((entry) => entry.id === message.id)) {
          return { ...current, items: withoutPending };
        }
        return { ...current, items: [...withoutPending, message] };
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData<MessagePage>(queryKeys.messages(conversationId), (current) =>
        current
          ? {
              ...current,
              items: current.items.filter(
                (entry) => entry.id !== `pending-${context?.clientMessageId}`,
              ),
            }
          : current,
      );
      setSendError(errorMessage(error));
    },
  });

  const submit = () => {
    const content = draft.trim();
    if (!content || sendMutation.isPending) return;
    const clientMessageId = crypto.randomUUID();
    setDraft("");
    sendMutation.mutate({ content, clientMessageId });
  };

  const loadOlder = async () => {
    if (!messagesQuery.data?.next_cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await listMessages(conversationId, {
        before_id: messagesQuery.data.next_cursor,
        limit: 50,
      });
      queryClient.setQueryData<MessagePage>(queryKeys.messages(conversationId), (current) =>
        current
          ? {
              ...current,
              items: [...older.items, ...current.items],
              has_more: older.has_more,
              next_cursor: older.next_cursor,
            }
          : current,
      );
    } catch (error) {
      toastError(error);
    } finally {
      setLoadingOlder(false);
    }
  };

  if (conversationQuery.isLoading || messagesQuery.isLoading) {
    return (
      <div className="container-page max-w-3xl space-y-4 py-8">
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (conversationQuery.isError || messagesQuery.isError || !conversation) {
    return (
      <div className="container-page max-w-3xl py-12">
        <ErrorState
          error={
            conversationQuery.error ?? messagesQuery.error ?? new Error("Conversation not found.")
          }
          onRetry={() => {
            void conversationQuery.refetch();
            void messagesQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="container-page max-w-3xl py-6 sm:py-8">
      <Link
        to="/messages"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All conversations
      </Link>

      <div className="mt-4 flex items-center gap-3 border-b border-line pb-4">
        <Avatar name={otherName} size="md" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-ink">
            {otherName}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.68rem] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  socketStatus === "live"
                    ? "bg-found"
                    : socketStatus === "connecting"
                      ? "bg-pending"
                      : "bg-muted-soft",
                )}
              />
              {socketStatus === "live"
                ? "Live"
                : socketStatus === "connecting"
                  ? "Connecting"
                  : "Offline"}
            </span>
            {conversation.claim_id ? (
              <Link
                to="/claims/$claimId"
                params={{ claimId: conversation.claim_id }}
                className="text-cobalt hover:underline"
              >
                View claim
              </Link>
            ) : conversation.match_id ? (
              <Link
                to="/matches/$matchId"
                params={{ matchId: conversation.match_id }}
                className="text-cobalt hover:underline"
              >
                View match
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-h-[55vh] flex-col rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex-1 space-y-1 overflow-y-auto p-4 sm:p-5">
          {hasOlder ? (
            <div className="flex justify-center pb-3">
              <Button
                variant="ghost"
                size="sm"
                isLoading={loadingOlder}
                onClick={() => void loadOlder()}
              >
                Load older messages
              </Button>
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <EmptyState
                icon={MessageCircle}
                title="Start the conversation"
                description="Say hello and share only what you need to arrange a safe handover."
              />
            </div>
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDay =
                !previous ||
                new Date(previous.created_at).toDateString() !==
                  new Date(message.created_at).toDateString();
              const mine = message.sender_id === user?.id;
              const pending = message.id.startsWith("pending-");
              return (
                <div key={message.id}>
                  {showDay ? (
                    <div className="flex items-center gap-3 py-4">
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-[0.62rem] font-medium tracking-wide text-muted-soft uppercase">
                        {dayLabel(message.created_at)}
                      </span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}
                  <div className={cn("flex gap-2.5 py-1", mine ? "justify-end" : "justify-start")}>
                    {!mine ? <Avatar name={otherName} size="xs" className="mt-1" /> : null}
                    <div className={cn("max-w-[82%]", mine ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "rounded-[var(--radius-card)] px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap",
                          mine
                            ? "rounded-br-md bg-cobalt text-white"
                            : "rounded-bl-md bg-paper-deep text-ink",
                          pending && "opacity-70",
                        )}
                      >
                        {message.content}
                      </div>
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-[0.6rem] text-muted-soft",
                          mine ? "justify-end" : "",
                        )}
                      >
                        {pending ? <LoaderCircle className="size-3 animate-spin" /> : null}
                        {timeLabel(message.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-line p-3 sm:p-4">
          {sendError ? (
            <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {sendError}
            </p>
          ) : null}
          <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 focus-within:border-cobalt focus-within:ring-4 focus-within:ring-cobalt/10">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Write a message…"
              rows={1}
              className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus:ring-0"
              aria-label="Message"
            />
            <Button
              size="icon-sm"
              className="mb-0.5 shrink-0 rounded-lg"
              disabled={!draft.trim() || sendMutation.isPending}
              onClick={submit}
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[0.62rem] text-muted-soft">
            Enter to send · Shift + Enter for a new line. Keep personal details out of chat.
          </p>
        </div>
      </div>

      {conversation.updated_at ? (
        <p className="mt-3 text-center text-[0.65rem] text-muted-soft">
          Conversation updated {formatRelative(conversation.updated_at)} · started{" "}
          {formatDate(conversation.created_at)}
        </p>
      ) : null}
    </div>
  );
}
