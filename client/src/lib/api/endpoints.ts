import { api, fetchWithAuth, toApiError, unwrapAsync } from "./client";
import { API_BASE_URL } from "./config";
import type {
  AuditLog,
  Claim,
  ClaimStatus,
  Conversation,
  Item,
  ItemCreate,
  ItemMatch,
  ItemStatus,
  ItemType,
  ItemUpdate,
  KnowledgeDocument,
  MatchStatus,
  Message,
  MessagePage,
  Notification,
  Page,
  User,
  UserRole,
} from "./types";

export type ItemFilters = {
  q?: string;
  type?: ItemType;
  category?: string;
  status?: ItemStatus;
  location?: string;
  occurred_from?: string;
  occurred_to?: string;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
  sort?: "created_at" | "occurred_at" | "title";
  order?: "asc" | "desc";
};

export type MyItemFilters = {
  page?: number;
  page_size?: number;
  status?: ItemStatus;
  include_withdrawn?: boolean;
};

export type ClaimFilters = {
  status?: ClaimStatus;
  item_id?: string;
  claimant_id?: string;
  page?: number;
  page_size?: number;
};

export type MatchFilters = {
  status?: MatchStatus;
  min_score?: number;
  include_stale?: boolean;
  page?: number;
  page_size?: number;
};

export type NotificationFilters = {
  unread_only?: boolean;
  type?: string;
  page?: number;
  page_size?: number;
};

export type UserFilters = {
  q?: string;
  role?: UserRole;
  is_active?: boolean;
  page?: number;
  page_size?: number;
};

export type AuditFilters = {
  actor_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
};

export type KnowledgeFilters = {
  status?: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";
  page?: number;
  page_size?: number;
};

export async function listItems(filters: ItemFilters = {}): Promise<Page<Item>> {
  return unwrapAsync(
    await api.GET("/api/v1/items", {
      params: { query: filters },
    }),
  );
}

export async function getItem(itemId: string): Promise<Item> {
  return unwrapAsync(
    await api.GET("/api/v1/items/{item_id}", {
      params: { path: { item_id: itemId } },
    }),
  );
}

export async function createItem(payload: ItemCreate): Promise<Item> {
  return unwrapAsync(await api.POST("/api/v1/items", { body: payload }));
}

export async function updateItem(itemId: string, payload: ItemUpdate): Promise<Item> {
  return unwrapAsync(
    await api.PATCH("/api/v1/items/{item_id}", {
      params: { path: { item_id: itemId } },
      body: payload,
    }),
  );
}

export async function withdrawItem(itemId: string): Promise<void> {
  await unwrapAsync(
    await api.DELETE("/api/v1/items/{item_id}", {
      params: { path: { item_id: itemId } },
    }),
  );
}

export async function closeItem(itemId: string): Promise<Item> {
  return unwrapAsync(
    await api.POST("/api/v1/items/{item_id}/close", {
      params: { path: { item_id: itemId } },
    }),
  );
}

export async function uploadItemImage(itemId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetchWithAuth(`${API_BASE_URL}/items/${itemId}/images`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw await toApiError(response, null);
  return (await response.json()) as { id: string; url: string };
}

export async function deleteItemImage(itemId: string, imageId: string): Promise<void> {
  await unwrapAsync(
    await api.DELETE("/api/v1/items/{item_id}/images/{image_id}", {
      params: { path: { item_id: itemId, image_id: imageId } },
    }),
  );
}

export async function listMyItems(filters: MyItemFilters = {}): Promise<Page<Item>> {
  return unwrapAsync(
    await api.GET("/api/v1/items/mine", {
      params: { query: filters },
    }),
  );
}

export async function submitClaim(itemId: string, message: string): Promise<Claim> {
  return unwrapAsync(
    await api.POST("/api/v1/items/{item_id}/claims", {
      params: { path: { item_id: itemId } },
      body: { message },
    }),
  );
}

export async function listMyClaims(filters: ClaimFilters = {}): Promise<Page<Claim>> {
  return unwrapAsync(
    await api.GET("/api/v1/claims/mine", {
      params: { query: filters },
    }),
  );
}

export async function getClaim(claimId: string): Promise<Claim> {
  return unwrapAsync(
    await api.GET("/api/v1/claims/{claim_id}", {
      params: { path: { claim_id: claimId } },
    }),
  );
}

export async function listManagerClaims(filters: ClaimFilters = {}): Promise<Page<Claim>> {
  return unwrapAsync(
    await api.GET("/api/v1/manager/claims", {
      params: { query: filters },
    }),
  );
}

export async function approveClaim(claimId: string, notes?: string): Promise<Claim> {
  return unwrapAsync(
    await api.POST("/api/v1/manager/claims/{claim_id}/approve", {
      params: { path: { claim_id: claimId } },
      body: notes ? { resolution_notes: notes } : {},
    }),
  );
}

export async function rejectClaim(claimId: string, notes: string): Promise<Claim> {
  return unwrapAsync(
    await api.POST("/api/v1/manager/claims/{claim_id}/reject", {
      params: { path: { claim_id: claimId } },
      body: { resolution_notes: notes },
    }),
  );
}

export async function completeHandover(claimId: string, notes?: string): Promise<Claim> {
  return unwrapAsync(
    await api.POST("/api/v1/manager/claims/{claim_id}/complete-handover", {
      params: { path: { claim_id: claimId } },
      body: notes ? { resolution_notes: notes } : {},
    }),
  );
}

export async function listItemMatches(
  itemId: string,
  filters: MatchFilters = {},
): Promise<Page<ItemMatch>> {
  return unwrapAsync(
    await api.GET("/api/v1/items/{item_id}/matches", {
      params: { path: { item_id: itemId }, query: filters },
    }),
  );
}

export async function getMatch(matchId: string): Promise<ItemMatch> {
  return unwrapAsync(
    await api.GET("/api/v1/matches/{match_id}", {
      params: { path: { match_id: matchId } },
    }),
  );
}

export async function feedbackMatch(matchId: string, status: MatchStatus): Promise<ItemMatch> {
  return unwrapAsync(
    await api.POST("/api/v1/matches/{match_id}/feedback", {
      params: { path: { match_id: matchId } },
      body: { status },
    }),
  );
}

export async function createConversation(payload: {
  type: "DIRECT" | "SUPPORT";
  claim_id?: string | null;
  match_id?: string | null;
  participant_ids?: string[];
}): Promise<Conversation> {
  return unwrapAsync(
    await api.POST("/api/v1/conversations", {
      body: payload,
    }),
  );
}

export async function listConversations(page = 1): Promise<Page<Conversation>> {
  return unwrapAsync(
    await api.GET("/api/v1/conversations", {
      params: { query: { page, page_size: 30 } },
    }),
  );
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  return unwrapAsync(
    await api.GET("/api/v1/conversations/{conversation_id}", {
      params: { path: { conversation_id: conversationId } },
    }),
  );
}

export async function listMessages(
  conversationId: string,
  options: { limit?: number; before_id?: string } = {},
): Promise<MessagePage> {
  return unwrapAsync(
    await api.GET("/api/v1/conversations/{conversation_id}/messages", {
      params: {
        path: { conversation_id: conversationId },
        query: { limit: options.limit ?? 40, before_id: options.before_id },
      },
    }),
  );
}

export async function sendMessage(
  conversationId: string,
  content: string,
  clientMessageId: string,
): Promise<Message> {
  return unwrapAsync(
    await api.POST("/api/v1/conversations/{conversation_id}/messages", {
      params: { path: { conversation_id: conversationId } },
      body: { content, client_message_id: clientMessageId },
    }),
  );
}

export async function markConversationRead(conversationId: string) {
  return unwrapAsync(
    await api.POST("/api/v1/conversations/{conversation_id}/read", {
      params: { path: { conversation_id: conversationId } },
    }),
  );
}

export async function listNotifications(
  filters: NotificationFilters = {},
): Promise<Page<Notification>> {
  return unwrapAsync(
    await api.GET("/api/v1/notifications", {
      params: { query: filters },
    }),
  );
}

export async function getUnreadCount(): Promise<number> {
  const data = await unwrapAsync(await api.GET("/api/v1/notifications/unread-count"));
  return data.unread_count;
}

export async function markNotificationRead(notificationId: string): Promise<Notification> {
  return unwrapAsync(
    await api.PATCH("/api/v1/notifications/{notification_id}/read", {
      params: { path: { notification_id: notificationId } },
    }),
  );
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await unwrapAsync(await api.POST("/api/v1/notifications/read-all"));
  return data.updated;
}

export async function sendChatbotMessage(message: string, sessionId?: string) {
  return unwrapAsync(
    await api.POST("/api/v1/chatbot/messages", {
      body: { message, session_id: sessionId },
    }),
  );
}

export async function getMe(): Promise<User> {
  return unwrapAsync(await api.GET("/api/v1/users/me"));
}

export async function updateMe(payload: { name?: string; email?: string }): Promise<User> {
  return unwrapAsync(await api.PATCH("/api/v1/users/me", { body: payload }));
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await unwrapAsync(
    await api.POST("/api/v1/users/me/change-password", {
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  );
}

export async function listUsers(filters: UserFilters = {}): Promise<Page<User>> {
  return unwrapAsync(
    await api.GET("/api/v1/admin/users", {
      params: { query: filters },
    }),
  );
}

export async function updateUserStatus(userId: string, isActive: boolean): Promise<User> {
  return unwrapAsync(
    await api.PATCH("/api/v1/admin/users/{user_id}/status", {
      params: { path: { user_id: userId } },
      body: { is_active: isActive },
    }),
  );
}

export async function updateUserRole(userId: string, role: UserRole): Promise<User> {
  return unwrapAsync(
    await api.PATCH("/api/v1/admin/users/{user_id}/role", {
      params: { path: { user_id: userId } },
      body: { role },
    }),
  );
}

export async function listAuditLogs(filters: AuditFilters = {}): Promise<Page<AuditLog>> {
  return unwrapAsync(
    await api.GET("/api/v1/admin/audit-logs", {
      params: { query: filters },
    }),
  );
}

export async function listKnowledgeDocuments(
  filters: KnowledgeFilters = {},
): Promise<Page<KnowledgeDocument>> {
  return unwrapAsync(
    await api.GET("/api/v1/admin/knowledge-documents", {
      params: { query: filters },
    }),
  );
}

export async function createKnowledgeDocument(payload: {
  title: string;
  source: string;
  version: string;
  content: string;
}): Promise<KnowledgeDocument> {
  return unwrapAsync(
    await api.POST("/api/v1/admin/knowledge-documents", {
      body: payload,
    }),
  );
}

export async function reindexKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
  return unwrapAsync(
    await api.POST("/api/v1/admin/knowledge-documents/{document_id}/reindex", {
      params: { path: { document_id: documentId } },
    }),
  );
}
