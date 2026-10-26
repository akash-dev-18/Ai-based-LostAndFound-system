import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Search, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";

const steps = [
  { icon: MapPin, title: "Report it", text: "A few details and a photo are enough." },
  { icon: Search, title: "Find the match", text: "We look across lost and found reports." },
  { icon: ShieldCheck, title: "Hand it over", text: "Coordinate safely with a verified claim." },
];

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-ink px-10 py-10 text-white lg:flex lg:flex-col">
        <div className="relative z-10 flex flex-1 flex-col">
          <Link to="/" className="inline-flex w-fit rounded-lg focus-visible:outline-offset-4">
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-white text-ink">
                <svg viewBox="0 0 32 32" className="size-5" fill="none" aria-hidden="true">
                  <path
                    d="M7 12.5h18v12H7z"
                    fill="currentColor"
                    fillOpacity="0.18"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M7 16h18"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeDasharray="2.5 2.5"
                  />
                  <circle cx="16" cy="21" r="2.6" fill="currentColor" />
                </svg>
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-[1.05rem] font-semibold tracking-[-0.04em]">Found</span>
                <span className="mt-1 text-[0.58rem] font-medium tracking-[0.14em] text-white/50 uppercase">
                  Campus lost & found
                </span>
              </span>
            </span>
          </Link>

          <div className="mt-auto max-w-lg pb-10">
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-white/45 uppercase">
              Lost things find their way back
            </p>
            <h2 className="mt-4 text-balance text-4xl leading-[1.06] font-semibold tracking-[-0.045em]">
              A calmer place for the things you lose.
            </h2>
            <p className="mt-4 max-w-md text-pretty text-sm leading-6 text-white/65">
              Report an item, look for a match, and coordinate a safe handover without the
              group-chat chaos.
            </p>

            <div className="mt-10 grid gap-4">
              {steps.map(({ icon: Icon, title: stepTitle, text }, index) => (
                <div key={stepTitle} className="flex items-start gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white/90">
                      <span className="mr-2 font-mono text-[0.65rem] text-white/35">
                        0{index + 1}
                      </span>
                      {stepTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-white/45">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-3 border-t border-white/10 pt-5 text-[0.7rem] text-white/35">
            <span>Built for the campus community</span>
            <span className="size-1 rounded-full bg-white/25" />
            <span>Private by default</span>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen flex-col bg-paper px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="lg:hidden">
            <Logo />
          </Link>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" />
            Back to browsing
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-ink">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </div>
          {children}
          <div className="mt-7 text-center text-sm text-muted">{footer}</div>
        </div>
      </section>
    </div>
  );
}
