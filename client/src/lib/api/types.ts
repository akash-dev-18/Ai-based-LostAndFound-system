import type { components } from "./schema";

export type Item = components["schemas"]["ItemRead"];
export type ItemImage = components["schemas"]["ItemImageRead"];
export type ItemCreate = components["schemas"]["ItemCreate"];
export type ItemUpdate = components["schemas"]["ItemUpdate"];
export type ItemMatch = components["schemas"]["ItemMatchRead"];
export type Claim = components["schemas"]["ClaimRead"];
export type ClaimCreate = components["schemas"]["ClaimCreate"];
export type Conversation = components["schemas"]["ConversationRead"];
export type ConversationParticipant = components["schemas"]["ConversationParticipantRead"];
export type Message = components["schemas"]["MessageRead"];
export type MessagePage = components["schemas"]["MessagePage"];
export type Notification = components["schemas"]["NotificationRead"];
export type User = components["schemas"]["UserRead"];
export type AuditLog = components["schemas"]["AuditLogRead"];
export type KnowledgeDocument = components["schemas"]["KnowledgeDocumentRead"];
export type ChatbotResponse = components["schemas"]["ChatbotMessageResponse"];
export type ChatbotSource = components["schemas"]["ChatbotSource"];

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type ItemType = Item["type"];
export type ItemStatus = Item["status"];
export type ClaimStatus = Claim["status"];
export type MatchStatus = ItemMatch["status"];
export type UserRole = User["role"];
