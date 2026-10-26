import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import type { CSSProperties } from "react";

import { ItemStatusBadge, TypeBadge } from "@/components/ui/badge";
import type { Item } from "@/lib/api/types";
import { cn, formatRelative } from "@/lib/utils";

import { ItemImage } from "./item-image";

export function ItemCard({
  item,
  className,
  style,
}: {
  item: Item;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Link
      to="/items/$itemId"
      params={{ itemId: item.id }}
      style={style}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-colors duration-150 hover:border-line-strong",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-line">
        <ItemImage
          src={item.images?.[0]?.url}
          alt={item.title}
          type={item.type}
          category={item.category}
          className="size-full"
          imageClassName="transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute top-2.5 left-2.5">
          <TypeBadge type={item.type} />
        </div>
        {item.status !== "OPEN" ? (
          <div className="absolute top-2.5 right-2.5">
            <ItemStatusBadge status={item.status} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <h3 className="line-clamp-2 text-[0.82rem] leading-[1.15rem] font-semibold tracking-[-0.01em] text-ink sm:text-[0.92rem] sm:leading-5">
          {item.title}
        </h3>
        <p className="mt-1 truncate text-[0.7rem] text-muted">
          {item.category}
          {item.is_owner ? <span className="text-cobalt"> · Yours</span> : null}
        </p>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line/70 pt-2.5 text-[0.62rem] text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:text-[0.68rem]">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
          <span className="shrink-0">{formatRelative(item.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}

export function ItemRow({ item }: { item: Item }) {
  return (
    <Link
      to="/items/$itemId"
      params={{ itemId: item.id }}
      className="group flex items-center gap-3 border-b border-line py-3 last:border-b-0"
    >
      <ItemImage
        src={item.images?.[0]?.url}
        alt={item.title}
        type={item.type}
        category={item.category}
        showLabel={false}
        className="size-12 shrink-0 rounded-md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TypeBadge type={item.type} />
          <span className="truncate text-[0.68rem] text-muted">{item.category}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-ink group-hover:text-cobalt">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[0.68rem] text-muted">{item.location}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.62rem] text-muted">{formatRelative(item.created_at)}</p>
        {item.status !== "OPEN" ? (
          <div className="mt-1">
            <ItemStatusBadge status={item.status} />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
