import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  BookOpen,
  CircleHelp,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { sendChatbotMessage } from "@/lib/api/endpoints";
import type { ChatbotResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type ChatEntry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; response: ChatbotResponse };

const SUGGESTIONS = [
  "How do I claim a found item?",
  "What should I write in a lost report?",
  "Where should we meet for a handover?",
  "How does matching work?",
];

export function AssistantPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation({
    mutationFn: ({ message }: { message: string }) => sendChatbotMessage(message, sessionId),
    onMutate: ({ message }) => {
      setEntries((current) => [
        ...current,
        { id: `u-${crypto.randomUUID()}`, role: "user", content: message },
      ]);
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    onSuccess: (response) => {
      setSessionId(response.session_id);
      setEntries((current) => [
        ...current,
        { id: `a-${crypto.randomUUID()}`, role: "assistant", response },
      ]);
      setError(null);
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    onError: (mutationError) => {
      setError(errorMessage(mutationError));
    },
  });

  const submit = (value?: string) => {
    const message = (value ?? draft).trim();
    if (!message || mutation.isPending) return;
    setDraft("");
    setError(null);
    mutation.mutate({ message });
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="container-page max-w-3xl py-8 sm:py-10">
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-cobalt">
            <Sparkles className="size-3.5" /> Found assistant
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">
            A little help finding the way.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Ask about reports, claims, handovers, or what to do next. Answers use the campus
            knowledge base and live reports when available.
          </p>
        </div>
        {entries.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RotateCcw className="size-3.5" />}
            onClick={() => {
              setEntries([]);
              setSessionId(undefined);
              setError(null);
            }}
          >
            New chat
          </Button>
        ) : null}
      </div>

      <div className="mt-5 rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="max-h-[58vh] min-h-[42vh] overflow-y-auto p-4 sm:p-6">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-[var(--radius-card)] bg-cobalt-soft text-cobalt">
                <WandSparkles className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-ink">What can I help with?</h2>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">
                Try one of these, or ask in your own words.
              </p>
              <div className="mt-5 grid w-full max-w-md gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-sm text-ink transition-colors hover:border-cobalt/30 hover:bg-cobalt-soft/30"
                  >
                    <CircleHelp className="size-4 shrink-0 text-cobalt" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {entries.map((entry) =>
                entry.role === "user" ? (
                  <div key={entry.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-[var(--radius-card)] rounded-br-md bg-cobalt px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-white">
                      {entry.content}
                    </div>
                  </div>
                ) : (
                  <div key={entry.id} className="flex gap-3">
                    <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-cobalt-soft text-cobalt">
                      <Sparkles className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-[var(--radius-card)] rounded-tl-md border border-line bg-paper-deep/50 px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-ink-soft">
                        {entry.response.answer}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {entry.response.grounded ? (
                          <Badge tone="resolved">Grounded in campus info</Badge>
                        ) : (
                          <Badge tone="pending">General guidance</Badge>
                        )}
                        {entry.response.uncertain ? (
                          <Badge tone="pending">Needs confirmation</Badge>
                        ) : null}
                        {entry.response.steps > 0 ? (
                          <span className="text-[0.62rem] text-muted-soft">
                            {entry.response.steps} step{entry.response.steps === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {entry.response.sources && entry.response.sources.length > 0 ? (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[0.62rem] font-semibold tracking-[0.1em] text-muted uppercase">
                            Sources
                          </p>
                          {entry.response.sources.map((source) => {
                            const isItem = source.type.toLowerCase().includes("item");
                            const content = (
                              <>
                                <BookOpen className="size-3.5 shrink-0" />
                                <span className="truncate">{source.title}</span>
                              </>
                            );
                            return isItem ? (
                              <Link
                                key={`${source.type}-${source.id}`}
                                to="/items/$itemId"
                                params={{ itemId: source.id }}
                                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-muted transition-colors hover:text-cobalt"
                              >
                                {content}
                              </Link>
                            ) : (
                              <div
                                key={`${source.type}-${source.id}`}
                                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-muted"
                              >
                                {content}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
              {mutation.isPending ? (
                <div className="flex gap-3">
                  <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-cobalt-soft text-cobalt">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="flex items-center gap-2 rounded-[var(--radius-card)] rounded-tl-md border border-line bg-paper-deep/50 px-4 py-3 text-sm text-muted">
                    <LoaderCircle className="size-4 animate-spin" /> Looking through the board…
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="border-t border-line p-3 sm:p-4">
          {error ? (
            <p className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}
          <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 focus-within:border-cobalt focus-within:ring-4 focus-within:ring-cobalt/10">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about a report, claim, or handover…"
              rows={1}
              className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus:ring-0"
              aria-label="Message the assistant"
            />
            <Button
              size="icon-sm"
              className="mb-0.5 shrink-0 rounded-lg"
              disabled={!draft.trim() || mutation.isPending}
              onClick={() => submit()}
              aria-label="Send message"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[0.62rem] text-muted-soft">
            The assistant can make mistakes. Confirm handover details with staff.
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mt-4 flex items-start gap-2 rounded-xl border border-line bg-paper-deep/50 px-4 py-3 text-xs leading-5 text-muted",
        )}
      >
        <Sparkles className="mt-0.5 size-4 shrink-0 text-cobalt" />
        <p>
          For urgent or sensitive issues, contact the lost & found desk directly. Do not share
          passwords, payment details, or full document numbers in chat.
        </p>
      </div>
    </div>
  );
}
