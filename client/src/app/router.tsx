import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { authStore } from "@/lib/auth/auth-store";

import { NotFoundPage } from "./not-found-page";

const AdminAuditPage = lazyRouteComponent(
  () => import("@/features/admin/admin-audit-page"),
  "AdminAuditPage",
);
const AdminKnowledgePage = lazyRouteComponent(
  () => import("@/features/admin/admin-knowledge-page"),
  "AdminKnowledgePage",
);
const AdminOverviewPage = lazyRouteComponent(
  () => import("@/features/admin/admin-overview-page"),
  "AdminOverviewPage",
);
const AdminUsersPage = lazyRouteComponent(
  () => import("@/features/admin/admin-users-page"),
  "AdminUsersPage",
);
const AssistantPage = lazyRouteComponent(
  () => import("@/features/assistant/assistant-page"),
  "AssistantPage",
);
const LoginPage = lazyRouteComponent(() => import("@/features/auth/login-page"), "LoginPage");
const ProfilePage = lazyRouteComponent(() => import("@/features/auth/profile-page"), "ProfilePage");
const RegisterPage = lazyRouteComponent(
  () => import("@/features/auth/register-page"),
  "RegisterPage",
);
const ConversationPage = lazyRouteComponent(
  () => import("@/features/chat/conversation-page"),
  "ConversationPage",
);
const ConversationsPage = lazyRouteComponent(
  () => import("@/features/chat/conversations-page"),
  "ConversationsPage",
);
const ClaimDetailPage = lazyRouteComponent(
  () => import("@/features/claims/claim-detail-page"),
  "ClaimDetailPage",
);
const StaffClaimDetailPage = lazyRouteComponent(() =>
  import("@/features/claims/claim-detail-page").then((module) => ({
    default: () => <module.ClaimDetailPage mode="staff" />,
  })),
);
const ClaimsPage = lazyRouteComponent(() => import("@/features/claims/claims-page"), "ClaimsPage");
const EditReportPage = lazyRouteComponent(
  () => import("@/features/items/edit-report-page"),
  "EditReportPage",
);
const HomePage = lazyRouteComponent(() => import("@/features/items/home-page"), "HomePage");
const ItemDetailPage = lazyRouteComponent(
  () => import("@/features/items/item-detail-page"),
  "ItemDetailPage",
);
const MyReportsPage = lazyRouteComponent(
  () => import("@/features/items/my-reports-page"),
  "MyReportsPage",
);
const ReportLostPage = lazyRouteComponent(() =>
  import("@/features/items/report-item-page").then((module) => ({
    default: () => <module.ReportItemPage type="LOST" />,
  })),
);
const ReportFoundPage = lazyRouteComponent(() =>
  import("@/features/items/report-item-page").then((module) => ({
    default: () => <module.ReportItemPage type="FOUND" />,
  })),
);
const ItemMatchesPage = lazyRouteComponent(
  () => import("@/features/matches/item-matches-page"),
  "ItemMatchesPage",
);
const MatchDetailPage = lazyRouteComponent(
  () => import("@/features/matches/match-detail-page"),
  "MatchDetailPage",
);
const NotificationsPage = lazyRouteComponent(
  () => import("@/features/notifications/notifications-page"),
  "NotificationsPage",
);
const ClaimsQueuePage = lazyRouteComponent(
  () => import("@/features/staff/claims-queue-page"),
  "ClaimsQueuePage",
);
const StaffItemsPage = lazyRouteComponent(
  () => import("@/features/staff/staff-items-page"),
  "StaffItemsPage",
);
const StaffOverviewPage = lazyRouteComponent(
  () => import("@/features/staff/staff-overview-page"),
  "StaffOverviewPage",
);

function RoutePending() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2.5 text-sm text-muted">
      <Spinner />
      <span>Loading…</span>
    </div>
  );
}

async function requireAuth(href: string) {
  const user = await authStore.ensureSession();
  if (!user) {
    throw redirect({
      to: "/login",
      search: { redirect: href },
      replace: true,
    });
  }
}

async function requireManager(href: string) {
  await requireAuth(href);
  const user = authStore.getUser();
  if (user?.role !== "MANAGER" && user?.role !== "ADMIN") {
    throw redirect({ to: "/", replace: true });
  }
}

async function requireAdmin(href: string) {
  await requireAuth(href);
  if (authStore.getUser()?.role !== "ADMIN") {
    throw redirect({ to: "/", replace: true });
  }
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  component: AppShell,
});

const protectedRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  id: "_protected",
  component: () => <Outlet />,
  beforeLoad: ({ location }) => requireAuth(location.href),
});

const staffRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/staff",
  component: () => <Outlet />,
  beforeLoad: ({ location }) => requireManager(location.href),
});

const adminRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/admin",
  component: () => <Outlet />,
  beforeLoad: ({ location }) => requireAdmin(location.href),
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: HomePage,
});

const itemDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/items/$itemId",
  component: ItemDetailPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: RegisterPage,
});

const reportLostRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/report/lost",
  component: ReportLostPage,
});

const reportFoundRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/report/found",
  component: ReportFoundPage,
});

const myReportsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/my/reports",
  component: MyReportsPage,
});

const editReportRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/my/reports/$itemId/edit",
  component: EditReportPage,
});

const itemMatchesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/my/reports/$itemId/matches",
  component: ItemMatchesPage,
});

const matchDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/matches/$matchId",
  component: MatchDetailPage,
});

const claimsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/claims",
  component: ClaimsPage,
});

const claimDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/claims/$claimId",
  component: ClaimDetailPage,
});

const messagesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/messages",
  component: ConversationsPage,
});

const conversationRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/messages/$conversationId",
  component: ConversationPage,
});

const notificationsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/notifications",
  component: NotificationsPage,
});

const profileRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/profile",
  component: ProfilePage,
});

const assistantRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/assistant",
  component: AssistantPage,
});

const staffOverviewRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "/",
  component: StaffOverviewPage,
});

const staffClaimsRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "claims",
  component: ClaimsQueuePage,
});

const staffClaimDetailRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "claims/$claimId",
  component: StaffClaimDetailPage,
});

const staffItemsRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "items",
  component: StaffItemsPage,
});

const adminOverviewRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  component: AdminOverviewPage,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "users",
  component: AdminUsersPage,
});

const adminKnowledgeRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "knowledge",
  component: AdminKnowledgePage,
});

const adminAuditRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "audit",
  component: AdminAuditPage,
});

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    indexRoute,
    itemDetailRoute,
    protectedRoute.addChildren([
      reportLostRoute,
      reportFoundRoute,
      myReportsRoute,
      editReportRoute,
      itemMatchesRoute,
      matchDetailRoute,
      claimsRoute,
      claimDetailRoute,
      messagesRoute,
      conversationRoute,
      notificationsRoute,
      profileRoute,
      assistantRoute,
      staffRoute.addChildren([
        staffOverviewRoute,
        staffClaimsRoute,
        staffClaimDetailRoute,
        staffItemsRoute,
      ]),
      adminRoute.addChildren([
        adminOverviewRoute,
        adminUsersRoute,
        adminKnowledgeRoute,
        adminAuditRoute,
      ]),
    ]),
  ]),
  loginRoute,
  registerRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 150,
  defaultPendingMinMs: 250,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
