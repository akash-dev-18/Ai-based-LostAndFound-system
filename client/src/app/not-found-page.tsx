import { Link } from "@tanstack/react-router";
import { Compass, SearchX } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="container-page flex h-[var(--header-height)] items-center">
        <Link to="/" className="rounded-lg">
          <Logo />
        </Link>
      </header>
      <main className="container-page flex flex-1 flex-col items-center justify-center py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface text-muted">
          <SearchX className="size-6" />
        </span>
        <p className="mt-5 font-mono text-[0.7rem] tracking-[0.16em] text-cobalt uppercase">
          404 · Off the board
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
          This page isn’t here.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">
          The link may be out of date, or the report may have been removed. Head back to the board
          and try again.
        </p>
        <Link to="/" className="mt-6">
          <Button leftIcon={<Compass className="size-4" />}>Browse reports</Button>
        </Link>
      </main>
    </div>
  );
}
