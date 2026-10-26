import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  ChevronDown,
  Compass,
  Home,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PackagePlus,
  PackageSearch,
  Plus,
  Shield,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnreadCount } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/use-auth";
import { cn } from "@/lib/utils";

import { Logo } from "./logo";

function Header() {
  const { user, isAuthenticated, isManager, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/90 backdrop-blur-md">
      <div className="container-page flex h-[var(--header-height)] items-center gap-3">
        <Link to="/" className="mr-1 shrink-0 rounded-lg focus-visible:outline-offset-4">
          <Logo />
        </Link>

        <nav className="ml-3 hidden items-center gap-1 lg:flex" aria-label="Primary">
          <HeaderLink to="/" active={pathname === "/"} icon={Compass}>
            Browse
          </HeaderLink>
          {isAuthenticated ? (
            <>
              <HeaderLink to="/my/reports" active={pathname.startsWith("/my/reports")}>
                My reports
              </HeaderLink>
              <HeaderLink to="/claims" active={pathname.startsWith("/claims")}>
                Claims
              </HeaderLink>
              <HeaderLink to="/messages" active={pathname.startsWith("/messages")}>
                Messages
              </HeaderLink>
            </>
          ) : null}
          {isManager ? (
            <HeaderLink to="/staff" active={pathname.startsWith("/staff")}>
              Staff
            </HeaderLink>
          ) : null}
          {isAdmin ? (
            <HeaderLink to="/admin" active={pathname.startsWith("/admin")}>
              Admin
            </HeaderLink>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/assistant"
            className="hidden size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-deep hover:text-cobalt sm:flex"
            aria-label="Open assistant"
          >
            <Sparkles className="size-[1.15rem]" />
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                to="/notifications"
                className="relative flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-deep hover:text-ink"
                aria-label="Notifications"
              >
                <Bell className="size-[1.15rem]" />
                {unread.data ? (
                  <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-lost px-1 text-[0.55rem] leading-4 font-bold text-white">
                    {unread.data > 9 ? "9+" : unread.data}
                  </span>
                ) : null}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="hidden sm:inline-flex"
                    leftIcon={<Plus className="size-3.5" />}
                    rightIcon={<ChevronDown className="size-3.5" />}
                  >
                    Report
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/report/lost" className="w-full">
                      <PackageSearch className="size-4" /> Report lost item
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/report/found" className="w-full">
                      <PackagePlus className="size-4" /> Report found item
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 rounded-full focus-visible:outline-offset-4"
                    aria-label="Open account menu"
                  >
                    <Avatar name={user?.name} size="sm" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <span className="block truncate text-sm font-semibold text-ink normal-case">
                      {user?.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.7rem] font-normal text-muted normal-case">
                      {user?.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="w-full">
                      <UserIcon className="size-4" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/my/reports" className="w-full">
                      <BookOpen className="size-4" /> My reports
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/messages" className="w-full">
                      <MessageCircle className="size-4" /> Messages
                    </Link>
                  </DropdownMenuItem>
                  {isManager ? (
                    <DropdownMenuItem asChild>
                      <Link to="/staff" className="w-full">
                        <LayoutDashboard className="size-4" /> Staff workspace
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {isAdmin ? (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="w-full">
                        <Shield className="size-4" /> Admin
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onSelect={() => {
                      void logout().then(() => navigate({ to: "/" }));
                    }}
                  >
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Create account</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderLink({
  to,
  active,
  icon: Icon,
  children,
}: {
  to: string;
  active?: boolean;
  icon?: typeof Compass;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-paper-deep text-ink" : "text-muted hover:bg-paper-deep/70 hover:text-ink",
      )}
    >
      {Icon ? <Icon className="size-4" /> : null}
      {children}
    </Link>
  );
}

function MobileNav() {
  const { isAuthenticated, isManager, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = [
    { to: "/", label: "Browse", icon: Home },
    { to: "/my/reports", label: "Reports", icon: BookOpen, auth: true },
    {
      to: isAdmin ? "/admin" : isManager ? "/staff/claims" : "/report/found",
      label: isAdmin ? "Admin" : isManager ? "Workspace" : "Report",
      icon: isAdmin || isManager ? LayoutDashboard : Plus,
      primary: !isAdmin && !isManager,
    },
    { to: "/messages", label: "Messages", icon: MessageCircle, auth: true },
    {
      to: isAuthenticated ? "/profile" : "/login",
      label: isAuthenticated ? "Profile" : "Sign in",
      icon: UserIcon,
    },
  ].filter((item) => !item.auth || isAuthenticated);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Mobile"
    >
      <div className="grid h-[var(--bottom-nav-height)] grid-cols-5">
        {items.map(({ to, label, icon: Icon, primary }) => {
          const active =
            to === "/"
              ? pathname === "/"
              : to === "/report/found"
                ? pathname.startsWith("/report")
                : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[0.62rem] font-medium transition-colors",
                active ? "text-cobalt" : "text-muted",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center",
                  primary && "size-8 rounded-lg bg-cobalt text-white",
                )}
              >
                <Icon
                  className={cn(
                    primary ? "size-4" : "size-5",
                    !primary && active && "stroke-[2.2]",
                  )}
                />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line pb-24 lg:pb-0">
      <div className="container-page flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo compact />
          <p className="text-xs text-muted">
            A calmer way to get lost things back to their people.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <Link to="/assistant" className="hover:text-ink">
            Help & assistant
          </Link>
          <Link to="/claims" className="hover:text-ink">
            Claims
          </Link>
          <span>© {new Date().getFullYear()} Found</span>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage) {
    return <main className="min-h-screen">{children ?? <Outlet />}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-24 lg:pb-0">{children ?? <Outlet />}</main>
      <Footer />
      <MobileNav />
    </div>
  );
}
