import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Plus, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { FormError } from "@/components/feedback/form-error";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { PageHeader } from "@/components/layout/page-header";
import { ProcessingBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import {
  createKnowledgeDocument,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
} from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import type { KnowledgeDocument } from "@/lib/api/types";
import { formatRelative } from "@/lib/utils";

type KnowledgeStatus = KnowledgeDocument["status"];

const documentSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(200),
  source: z.string().trim().min(2, "Enter a source name.").max(200),
  version: z.string().trim().min(1, "Enter a version.").max(50),
  content: z.string().trim().min(20, "Add at least a short paragraph of content.").max(100_000),
});

type DocumentValues = z.infer<typeof documentSchema>;

const TABS: { value: KnowledgeStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "READY", label: "Ready" },
  { value: "FAILED", label: "Failed" },
];

export function AdminKnowledgePage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<KnowledgeStatus | undefined>();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.knowledge({ status, page, page_size: 20 }),
    queryFn: () => listKnowledgeDocuments({ status, page, page_size: 20 }),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
  });

  const form = useForm<DocumentValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: { title: "", source: "", version: "1.0", content: "" },
  });

  const createMutation = useMutation({
    mutationFn: createKnowledgeDocument,
    onSuccess: (document) => {
      toastSuccess(`“${document.title}” queued for indexing.`);
      setCreateOpen(false);
      form.reset();
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const reindexMutation = useMutation({
    mutationFn: reindexKnowledgeDocument,
    onSuccess: (document) => {
      toastSuccess(`“${document.title}” queued for reindexing.`);
      void queryClient.invalidateQueries({ queryKey: ["knowledge-documents"] });
    },
    onError: toastError,
  });

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Knowledge base"
        description="Manage the guidance the assistant uses when answering campus questions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin">
              <Button variant="secondary" leftIcon={<ArrowLeft className="size-4" />}>
                Overview
              </Button>
            </Link>
            <Button
              leftIcon={<Plus className="size-4" />}
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              Add document
            </Button>
          </div>
        }
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status ?? "ALL"}
          onValueChange={(value) => {
            setStatus(value === "ALL" ? undefined : (value as KnowledgeStatus));
            setPage(1);
          }}
        >
          <TabsList className="max-w-full overflow-x-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted">
          {query.data ? `${query.data.total} document${query.data.total === 1 ? "" : "s"}` : " "}
        </p>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data?.items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No knowledge documents"
            description="Add guidance for handovers, claims, safety, or campus policies. New documents are indexed in the background."
            action={<Button onClick={() => setCreateOpen(true)}>Add the first document</Button>}
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[1fr_170px_130px_150px_110px] gap-4 border-b border-line px-5 py-3 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase md:grid">
                <span>Document</span>
                <span>Source</span>
                <span>Status</span>
                <span>Updated</span>
                <span />
              </div>
              <div className="divide-y divide-line">
                {query.data?.items.map((document) => {
                  const reindexing =
                    reindexMutation.isPending && reindexMutation.variables === document.id;
                  return (
                    <div
                      key={document.id}
                      className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_170px_130px_150px_110px] md:items-center md:gap-4 md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{document.title}</p>
                        <p className="mt-0.5 text-[0.65rem] text-muted">
                          Version {document.version}
                        </p>
                      </div>
                      <p className="truncate text-xs text-muted">{document.source}</p>
                      <div>
                        <ProcessingBadge status={document.status} />
                      </div>
                      <p className="text-xs text-muted">{formatRelative(document.updated_at)}</p>
                      <div className="md:text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={reindexing}
                          disabled={document.status === "PROCESSING"}
                          leftIcon={<RefreshCw className="size-3.5" />}
                          onClick={() => reindexMutation.mutate(document.id)}
                        >
                          Reindex
                        </Button>
                      </div>
                    </div>
                  );
                })}
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

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-paper-deep/50 px-4 py-3 text-xs leading-5 text-muted">
        <Search className="mt-0.5 size-4 shrink-0 text-cobalt" />
        <p>
          Indexing runs in the background worker. Documents stay pending until the worker and AI
          provider are available. Reindex after editing source content.
        </p>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFormError(null);
        }}
      >
        <DialogContent
          title="Add knowledge document"
          description="Paste the guidance as plain text. The worker will split and index it."
          className="max-w-2xl"
        >
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              setFormError(null);
              createMutation.mutate(values);
            })}
          >
            <FormError message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="doc-title" error={form.formState.errors.title?.message}>
                <Input
                  id="doc-title"
                  placeholder="Handover safety guidance"
                  {...form.register("title")}
                />
              </Field>
              <Field
                label="Source"
                htmlFor="doc-source"
                error={form.formState.errors.source?.message}
              >
                <Input
                  id="doc-source"
                  placeholder="Campus safety office"
                  {...form.register("source")}
                />
              </Field>
            </div>
            <Field
              label="Version"
              htmlFor="doc-version"
              error={form.formState.errors.version?.message}
            >
              <Input id="doc-version" className="sm:max-w-40" {...form.register("version")} />
            </Field>
            <Field
              label="Content"
              htmlFor="doc-content"
              hint={`${form.watch("content").length.toLocaleString()} / 100,000`}
              error={form.formState.errors.content?.message}
            >
              <Textarea
                id="doc-content"
                rows={10}
                placeholder="Write clear, practical guidance…"
                className="min-h-52"
                {...form.register("content")}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setCreateOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={createMutation.isPending}>
                Add document
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
