import {
  Backpack,
  BookOpen,
  CreditCard,
  CupSoda,
  ImageOff,
  KeyRound,
  Laptop,
  type LucideIcon,
  PackageOpen,
  Shirt,
  Wallet,
  Watch,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Bags: Backpack,
  Electronics: Laptop,
  Wallets: Wallet,
  "Cards & IDs": CreditCard,
  Keys: KeyRound,
  Bottles: CupSoda,
  Clothing: Shirt,
  Accessories: Watch,
  "Books & Notes": BookOpen,
  Other: PackageOpen,
};

export function ItemImage({
  src,
  alt,
  type,
  category,
  showLabel = true,
  className,
  imageClassName,
}: {
  src?: string | null;
  alt: string;
  type?: "LOST" | "FOUND";
  category?: string | null;
  showLabel?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && failedSrc === src;

  if (!src || failed) {
    const Icon = (category && CATEGORY_ICONS[category]) || (type ? PackageOpen : ImageOff);
    return (
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-1.5 overflow-hidden bg-paper-deep text-muted",
          className,
        )}
        aria-label={alt}
        role="img"
      >
        <Icon className="size-7" strokeWidth={1.5} aria-hidden="true" />
        {showLabel ? (
          <span className="max-w-full truncate px-2 text-[0.6rem] font-medium tracking-wide text-muted-soft uppercase">
            {category || "No photo"}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-paper-deep", className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn("size-full object-cover", imageClassName)}
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
