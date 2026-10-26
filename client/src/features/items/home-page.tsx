import { Link } from "@tanstack/react-router";
import { ArrowRight, Search, ShieldCheck, X } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ItemCard, ItemRow } from "@/components/items/item-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { CardSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue, useItems } from "@/lib/api/hooks";
import type { ItemType } from "@/lib/api/types";
import { CATEGORIES, cn } from "@/lib/utils";

const POPULAR_SEARCHES = ["Bottle", "Student ID", "AirPods", "Hartley Library"];

const HOW_IT_WORKS = [
  {
    title: "Report it",
    text: "Add a photo, the place, and the details that make the item recognizable.",
  },
  {
    title: "Find the match",
    text: "Search the board or review the candidates the matching service surfaces.",
  },
  {
    title: "Claim and collect",
    text: "Send proof, wait for staff approval, then arrange a safe handover.",
  },
];

export function HomePage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ItemType | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const filters = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      type,
      category,
      page,
      page_size: 8,
      sort: "created_at" as const,
      order: "desc" as const,
    }),
    [debouncedQuery, type, category, page],
  );

  const itemsQuery = useItems(filters);
  const recentQuery = useItems({
    page: 1,
    page_size: 3,
    sort: "created_at",
    order: "desc",
  });
  const totalQuery = useItems({ page: 1, page_size: 1 });
  const items = itemsQuery.data?.items ?? [];
  const recent = recentQuery.data?.items ?? [];

  const hasFilters = Boolean(debouncedQuery || type || category);

  const showBoard = () => {
    document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applySearch = (value: string) => {
    setQuery(value);
    setPage(1);
    showBoard();
  };

  return (
    <div>
      <section className="border-b border-line">
        <div className="container-page grid gap-8 py-9 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:gap-14">
          <div className="page-enter">
            <p className="inline-flex items-center gap-2 text-xs font-medium text-cobalt">
              <span className="size-1.5 rounded-full bg-found" aria-hidden="true" />
              Campus lost &amp; found
            </p>
            <h1 className="mt-4 max-w-2xl text-balance text-3xl leading-[1.08] font-semibold tracking-[-0.045em] text-ink sm:text-4xl">
              Lost something?
              <span className="block text-muted">Start with what you remember.</span>
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-sm leading-6 text-muted">
              Search found reports, post what went missing, and get a clear path back to your things
              — without digging through group chats.
            </p>

            <search className="mt-6 block max-w-2xl">
              <form
                className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-line bg-surface p-1.5 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  showBoard();
                }}
              >
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Try “blue bottle”, “Hartley”, or “student ID”"
                    className="h-11 border-transparent bg-transparent pl-10 shadow-none focus:ring-0"
                    aria-label="Search lost and found reports"
                  />
                </div>
                <Button type="submit" size="lg" className="sm:w-auto">
                  Search reports
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </form>
            </search>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="font-medium text-ink-soft">Try</span>
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => applySearch(term)}
                  className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-cobalt"
                >
                  {term}
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.68rem] text-muted">
              <span>
                {totalQuery.data
                  ? `${totalQuery.data.total} report${totalQuery.data.total === 1 ? "" : "s"} on the board`
                  : "Campus reports, updated live"}
              </span>
              <span
                className="hidden size-1 rounded-full bg-line-strong sm:block"
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-found" aria-hidden="true" />
                Staff-reviewed claims
              </span>
            </div>
          </div>

          <aside className="page-enter">
            <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Recently reported</h2>
                <p className="mt-0.5 text-xs text-muted">The latest from the campus board.</p>
              </div>
              <a
                href="#board"
                className="shrink-0 text-xs font-semibold text-cobalt hover:underline"
              >
                View board
              </a>
            </div>

            {recentQuery.isLoading ? (
              <div className="space-y-3 py-3">
                {Array.from({ length: 3 }, (_, index) => `recent-${index}`).map((key) => (
                  <div key={key} className="flex gap-3 py-1">
                    <div className="size-12 animate-pulse rounded-md bg-paper-deep" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-paper-deep" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-paper-deep" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentQuery.isError ? (
              <div className="py-5 text-xs leading-5 text-muted">
                Recent reports are unavailable.{" "}
                <button
                  type="button"
                  onClick={() => void recentQuery.refetch()}
                  className="font-semibold text-cobalt hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : recent.length === 0 ? (
              <div className="py-6 text-xs leading-5 text-muted">
                Nothing has been reported yet.{" "}
                <Link to="/report/found" className="font-semibold text-cobalt hover:underline">
                  Post the first found item
                </Link>
                .
              </div>
            ) : (
              <div>
                {recent.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-[0.68rem] text-muted">Found something on campus?</p>
              <Link
                to="/report/found"
                className="inline-flex items-center gap-1 text-xs font-semibold text-cobalt hover:underline"
              >
                Report it <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section id="board" className="container-page scroll-mt-20 py-10 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl">
              The board
            </h2>
            <p className="mt-1 text-sm text-muted">
              Browse what the campus has lost and found lately.
            </p>
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
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5 border-y border-line py-2.5">
          <span className="mr-2 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">
            Category
          </span>
          <button
            type="button"
            onClick={() => {
              setCategory(undefined);
              setPage(1);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              !category ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
            )}
          >
            All
          </button>
          {CATEGORIES.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => {
                setCategory(category === entry ? undefined : entry);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                category === entry
                  ? "bg-ink text-white"
                  : "text-muted hover:bg-paper-deep hover:text-ink",
              )}
            >
              {entry}
            </button>
          ))}
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setType(undefined);
                setCategory(undefined);
                setPage(1);
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-cobalt hover:bg-cobalt-soft"
            >
              <X className="size-3.5" aria-hidden="true" /> Clear filters
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          {itemsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => `skeleton-${index}`).map((key) => (
                <CardSkeleton key={key} />
              ))}
            </div>
          ) : itemsQuery.isError ? (
            <ErrorState error={itemsQuery.error} onRetry={() => void itemsQuery.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="Nothing matches yet"
              description="Try a broader search, another category, or be the first to post this item."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/report/lost">
                    <Button variant="secondary" size="sm">
                      Report lost
                    </Button>
                  </Link>
                  <Link to="/report/found">
                    <Button size="sm">Report found</Button>
                  </Link>
                </div>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {items.map((item, index) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    style={{ "--stagger": index } as CSSProperties}
                  />
                ))}
              </div>
              <div className="mt-8">
                <Pagination
                  page={itemsQuery.data?.page ?? 1}
                  pages={itemsQuery.data?.pages ?? 1}
                  total={itemsQuery.data?.total ?? 0}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="border-y border-line bg-surface/40">
        <div className="container-page grid gap-8 py-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16 lg:py-12">
          <div>
            <h2 className="text-balance text-2xl font-semibold tracking-[-0.03em] text-ink">
              How returns work
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              Found keeps the process simple and private, with staff oversight when a claim needs a
              second look.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/report/lost">
                <Button variant="secondary" size="sm">
                  Report a lost item
                </Button>
              </Link>
              <Link to="/report/found">
                <Button size="sm">Report a found item</Button>
              </Link>
            </div>
          </div>
          <div className="divide-y divide-line">
            {HOW_IT_WORKS.map((step, index) => (
              <div
                key={step.title}
                className="grid gap-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[2.5rem_1fr]"
              >
                <span className="font-mono text-[0.68rem] text-cobalt">0{index + 1}</span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-muted">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
