import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MapPin } from "lucide-react";

import { ItemImage } from "@/components/items/item-image";
import { MatchStatusBadge } from "@/components/ui/badge";
import { useItem } from "@/lib/api/hooks";
import type { ItemMatch } from "@/lib/api/types";
import { formatRelative, formatScore } from "@/lib/utils";

export function MatchCard({ match, ownedItemId }: { match: ItemMatch; ownedItemId: string }) {
  const counterpartId =
    match.lost_item_id === ownedItemId ? match.found_item_id : match.lost_item_id;
  const itemQuery = useItem(counterpartId);
  const item = itemQuery.data;
  const counterpartType = match.lost_item_id === ownedItemId ? "FOUND" : "LOST";
  const reasons = [
    (match.text_score ?? 0) >= 0.6 ? "description" : null,
    (match.image_score ?? 0) >= 0.6 ? "photo" : null,
    (match.attribute_score ?? 0) >= 0.6 ? "details" : null,
  ].filter((reason): reason is string => Boolean(reason));
  const reasonText =
    reasons.length <= 1
      ? (reasons[0] ?? "")
      : reasons.length === 2
        ? `${reasons[0]} and ${reasons[1]}`
        : `${reasons[0]}, ${reasons[1]}, and ${reasons[2]}`;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="group flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3 transition-colors hover:border-line-strong"
    >
      <ItemImage
        src={item?.images?.[0]?.url}
        alt={item?.title ?? "Matched item"}
        type={counterpartType}
        showLabel={false}
        className="size-20 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              Possible {counterpartType === "FOUND" ? "found match" : "lost match"}
            </p>
            <h3 className="mt-1 truncate text-sm font-semibold text-ink group-hover:text-cobalt">
              {itemQuery.isLoading ? "Loading item…" : (item?.title ?? "Item unavailable")}
            </h3>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-muted transition-colors group-hover:text-cobalt" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted">
          {item ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {item.location}
            </span>
          ) : null}
          <span>{formatRelative(match.created_at)}</span>
        </div>
        {reasons.length > 0 ? (
          <p className="mt-1.5 text-[0.68rem] text-muted-soft">Matched on {reasonText}</p>
        ) : null}
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line/70 pt-2.5">
          <MatchStatusBadge status={match.status} />
          <span className="text-sm font-semibold text-ink">{formatScore(match.final_score)}</span>
        </div>
      </div>
    </Link>
  );
}
