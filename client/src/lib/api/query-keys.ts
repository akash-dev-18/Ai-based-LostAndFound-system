import type {
  AuditFilters,
  ClaimFilters,
  ItemFilters,
  KnowledgeFilters,
  MatchFilters,
  MyItemFilters,
  NotificationFilters,
  UserFilters,
} from "./endpoints";

export const queryKeys = {
  items: (filters: ItemFilters = {}) => ["items", filters] as const,
  item: (itemId: string) => ["item", itemId] as const,
  myItems: (filters: MyItemFilters = {}) => ["my-items", filters] as const,
  myClaims: (filters: ClaimFilters = {}) => ["my-claims", filters] as const,
  claim: (claimId: string) => ["claim", claimId] as const,
  managerClaims: (filters: ClaimFilters = {}) => ["manager-claims", filters] as const,
  itemMatches: (itemId: string, filters: MatchFilters = {}) =>
    ["item-matches", itemId, filters] as const,
  match: (matchId: string) => ["match", matchId] as const,
  conversations: (page = 1) => ["conversations", page] as const,
  conversation: (conversationId: string) => ["conversation", conversationId] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  notifications: (filters: NotificationFilters = {}) => ["notifications", filters] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  me: ["me"] as const,
  users: (filters: UserFilters = {}) => ["admin-users", filters] as const,
  audit: (filters: AuditFilters = {}) => ["audit-logs", filters] as const,
  knowledge: (filters: KnowledgeFilters = {}) => ["knowledge-documents", filters] as const,
  chatbot: (sessionId: string | null) => ["chatbot", sessionId] as const,
};
