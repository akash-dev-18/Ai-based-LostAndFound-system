import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, PackageSearch, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { ItemImage } from "@/components/items/item-image";
import { PageHeader } from "@/components/layout/page-header";
import { ItemStatusBadge, TypeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { closeItem } from "@/lib/api/endpoints";
import { useDebouncedValue, useItems } from "@/lib/api/hooks";
import type { Item, ItemStatus, ItemType } from "@/lib/api/types";
import { formatRelative } from "@/lib/utils";

const STATUS_OPTIONS: { value: ItemStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "CLAIM_PENDING", label: "Claim in progress" },
  { value: "RESOLVED", label: "Returned" },
  { value: "CLOSED", label: "Closed" },
];

export function StaffItemsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ItemType | undefined>();
  const [status, setStatus] = useState<ItemStatus | undefined>();
  const [page, setPage] = useState(1);
  const [closeTarget, setCloseTarget] = useState<Item | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);

  const filters = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      type,
      status,
      page,
      page_size: 20,
      sort: "created_at" as const,
      order: "desc" as const,
    }),
    [debouncedSearch, page, status, type],
  );
  const query = useItems(filters);

  const closeMutation = useMutation({
    mutationFn: (itemId: string) => closeItem(itemId),
    onSuccess: (item) => {
      toastSuccess(`“${item.title}” closed.`);
      setCloseTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["item", item.id] });
      void queryClient.invalidateQueries({ queryKey: ["manager-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["my-claims"] });
    },
    onError: toastError,
  });

  const resetFilters = () => {
    setSearch("");
    setType(undefined);
    setStatus(undefined);
    setPage(1);
  };

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Staff workspace"
        title="Reports"
        description="Browse every lost and found report. Close reports that are no longer active."
        actions={
          <Link to="/staff">
            <Button variant="secondary" leftIcon={<ArrowLeft className="size-4" />}>
              Overview
            </Button>
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search title, description, brand, or location"
            className="pl-10"
            aria-label="Search reports"
          />
        </div>
        <Tabs
          value={type ?? "ALL"}
          onValueChange={(value) => {
            setType(value === "ALL" ? undefined : (value as ItemType));
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="LOST">Lost</TabsTrigger>
            <TabsTrigger value="FOUND">Found</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select
          value={status ?? ""}
          onChange={(event) => {
            setStatus((event.target.value || undefined) as ItemStatus | undefined);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="lg:w-48"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data?.items.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No reports match"
            description="Try a different search, type, or status."
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[1fr_160px_150px_100px] gap-4 border-b border-line px-5 py-3 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase lg:grid">
                <span>Report</span>
                <span>Location</span>
                <span>Status</span>
                <span />
              </div>
              <div className="divide-y divide-line">
                {query.data?.items.map((item) => {
                  const canClose = item.status === "OPEN" || item.status === "CLAIM_PENDING";
                  return (
                    <div
                      key={item.id}
                      className="grid gap-3 px-4 py-4 transition-colors hover:bg-paper-deep/30 sm:px-5 lg:grid-cols-[1fr_160px_150px_100px] lg:items-center lg:gap-4"
                    >
                      <Link
                        to="/items/$itemId"
                        params={{ itemId: item.id }}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <ItemImage
                          src={item.images?.[0]?.url}
                          alt={item.title}
                          type={item.type}
                          showLabel={false}
                          className="size-14 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <TypeBadge type={item.type} />
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-ink hover:text-cobalt">
                            {item.title}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                            {item.category} · {formatRelative(item.created_at)}
                          </p>
                        </div>
                      </Link>
                      <p className="truncate text-xs text-muted">{item.location}</p>
                      <div>
                        <ItemStatusBadge status={item.status} />
                      </div>
                      <div className="lg:text-right">
                        {canClose ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted hover:bg-danger-soft hover:text-danger"
                            leftIcon={<XCircle className="size-3.5" />}
                            onClick={() => setCloseTarget(item)}
                          >
                            Close
                          </Button>
                        ) : (
                          <span className="text-[0.65rem] text-muted-soft">No action</span>
                        )}
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

      <ConfirmDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null);
        }}
        title="Close this report?"
        description={
          closeTarget
            ? `“${closeTarget.title}” will be removed from active matching. Any open claims will be cancelled.`
            : ""
        }
        confirmLabel="Close report"
        isLoading={closeMutation.isPending}
        onConfirm={() => {
          if (closeTarget) closeMutation.mutate(closeTarget.id);
        }}
      />
    </div>
  );
}
