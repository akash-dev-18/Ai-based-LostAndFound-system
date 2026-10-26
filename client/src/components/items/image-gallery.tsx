import { useState } from "react";
import type { ItemImage as ItemImageType } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { ItemImage } from "./item-image";

export function ImageGallery({
  images,
  title,
  type,
}: {
  images: ItemImageType[];
  title: string;
  type: "LOST" | "FOUND";
}) {
  const [activeId, setActiveId] = useState(images[0]?.id);
  const active = images.find((image) => image.id === activeId) ?? images[0];

  return (
    <div className="space-y-3">
      <ItemImage
        src={active?.url}
        alt={title}
        type={type}
        className="aspect-[4/3] w-full rounded-[var(--radius-card)] border border-line bg-surface"
        imageClassName="object-contain transition-opacity duration-300"
      />
      {images.length > 1 ? (
        <div className="grid grid-cols-5 gap-2">
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveId(image.id)}
              className={cn(
                "overflow-hidden rounded-lg border-2 transition-colors",
                image.id === active?.id
                  ? "border-cobalt"
                  : "border-transparent hover:border-line-strong",
              )}
              aria-label={`View image ${images.indexOf(image) + 1}`}
              aria-pressed={image.id === active?.id}
            >
              <ItemImage
                src={image.url}
                alt={`${title} thumbnail ${images.indexOf(image) + 1}`}
                className="aspect-square w-full"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
