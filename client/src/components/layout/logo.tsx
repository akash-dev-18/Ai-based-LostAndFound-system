import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 items-center justify-center overflow-hidden rounded-lg bg-cobalt text-white",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="size-5" fill="none">
        <path
          d="M7 12.5h18v12H7z"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M7 16h18" stroke="currentColor" strokeWidth="1.7" strokeDasharray="2.5 2.5" />
        <circle cx="16" cy="21" r="2.6" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="text-[1.05rem] font-semibold tracking-[-0.04em] text-ink">Found</span>
          <span className="mt-1 text-[0.58rem] font-medium tracking-[0.14em] text-muted uppercase">
            Campus lost & found
          </span>
        </span>
      ) : null}
    </span>
  );
}
