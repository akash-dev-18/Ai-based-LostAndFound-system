import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Search, Shield, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { toastError, toastSuccess } from "@/components/feedback/toast";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { listUsers, updateUserRole, updateUserStatus } from "@/lib/api/endpoints";
import { useDebouncedValue } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import type { User, UserRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/use-auth";
import { formatDate } from "@/lib/utils";

const ROLE_LABEL: Record<UserRole, string> = {
  USER: "Student",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [active, setActive] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [statusTarget, setStatusTarget] = useState<{ user: User; nextActive: boolean } | null>(
    null,
  );
  const debouncedSearch = useDebouncedValue(search, 350);

  const filters = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      role: role || undefined,
      is_active: active === "all" ? undefined : active === "active",
      page,
      page_size: 20,
    }),
    [active, debouncedSearch, page, role],
  );

  const query = useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () => listUsers(filters),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      updateUserStatus(userId, isActive),
    onSuccess: (updated) => {
      toastSuccess(`${updated.name} is now ${updated.is_active ? "active" : "inactive"}.`);
      setStatusTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: toastError,
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: string; nextRole: UserRole }) =>
      updateUserRole(userId, nextRole),
    onSuccess: (updated) => {
      toastSuccess(`${updated.name} is now ${ROLE_LABEL[updated.role]}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: toastError,
  });

  const resetFilters = () => {
    setSearch("");
    setRole("");
    setActive("all");
    setPage(1);
  };

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Manage account access and staff roles. Changes are recorded in the audit log."
        actions={
          <Link to="/admin">
            <Button variant="secondary" leftIcon={<ArrowLeft className="size-4" />}>
              Overview
            </Button>
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email"
            className="pl-10"
            aria-label="Search users"
          />
        </div>
        <Select
          value={role}
          onChange={(event) => {
            setRole(event.target.value as UserRole | "");
            setPage(1);
          }}
          aria-label="Filter by role"
          className="lg:w-44"
        >
          <option value="">All roles</option>
          <option value="USER">Students</option>
          <option value="MANAGER">Managers</option>
          <option value="ADMIN">Admins</option>
        </Select>
        <Select
          value={active}
          onChange={(event) => {
            setActive(event.target.value as "all" | "active" | "inactive");
            setPage(1);
          }}
          aria-label="Filter by account status"
          className="lg:w-44"
        >
          <option value="all">All accounts</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => `skeleton-${index}`).map((key) => (
              <Skeleton key={key} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data?.items.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No accounts match"
            description="Try a different search, role, or status."
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="hidden grid-cols-[1fr_170px_160px_110px] gap-4 border-b border-line px-5 py-3 text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase md:grid">
                <span>Account</span>
                <span>Role</span>
                <span>Joined</span>
                <span className="text-right">Access</span>
              </div>
              <div className="divide-y divide-line">
                {query.data?.items.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  const rolePending =
                    roleMutation.isPending && roleMutation.variables?.userId === user.id;
                  return (
                    <div
                      key={user.id}
                      className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_170px_160px_110px] md:items-center md:gap-4 md:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={user.name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                            {isSelf ? <Badge tone="open">You</Badge> : null}
                            {!user.is_active ? <Badge tone="rejected">Inactive</Badge> : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
                        </div>
                      </div>
                      <div>
                        {isSelf ? (
                          <Badge tone="neutral">
                            <Shield className="size-3" /> {ROLE_LABEL[user.role]}
                          </Badge>
                        ) : (
                          <Select
                            value={user.role}
                            disabled={rolePending}
                            onChange={(event) =>
                              roleMutation.mutate({
                                userId: user.id,
                                nextRole: event.target.value as UserRole,
                              })
                            }
                            aria-label={`Role for ${user.name}`}
                            className="h-9 text-xs"
                          >
                            <option value="USER">Student</option>
                            <option value="MANAGER">Manager</option>
                            <option value="ADMIN">Admin</option>
                          </Select>
                        )}
                      </div>
                      <p className="text-xs text-muted">{formatDate(user.created_at)}</p>
                      <div className="flex items-center justify-between gap-2 md:justify-end">
                        <span className="text-xs text-muted md:hidden">
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                        <Switch
                          checked={user.is_active}
                          disabled={isSelf || statusMutation.isPending}
                          onCheckedChange={(checked) =>
                            setStatusTarget({ user, nextActive: checked })
                          }
                          aria-label={`Account access for ${user.name}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-8">
              <Pagination
                page={query.data?.page ?? 1}
                pages={query.data?.pages ?? 1}
                total={query.data?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title={statusTarget?.nextActive ? "Restore account access?" : "Disable this account?"}
        description={
          statusTarget
            ? statusTarget.nextActive
              ? `${statusTarget.user.name} will be able to sign in and use Found again.`
              : `${statusTarget.user.name} will be signed out and unable to sign in until restored.`
            : ""
        }
        confirmLabel={statusTarget?.nextActive ? "Restore access" : "Disable account"}
        tone={statusTarget?.nextActive ? "primary" : "danger"}
        isLoading={statusMutation.isPending}
        onConfirm={() => {
          if (!statusTarget) return;
          statusMutation.mutate({
            userId: statusTarget.user.id,
            isActive: statusTarget.nextActive,
          });
        }}
      />
    </div>
  );
}
