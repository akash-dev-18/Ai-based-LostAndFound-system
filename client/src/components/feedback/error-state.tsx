import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";

export function ErrorState({
  error,
  title = "We couldn’t load this",
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-danger/15 bg-danger-soft/40 px-6 py-12 text-center"
      role="alert"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-[var(--radius-card)] bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted">{errorMessage(error)}</p>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-5"
          leftIcon={<RotateCw className="size-3.5" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
