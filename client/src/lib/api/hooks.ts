import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAuth } from "../auth/use-auth";
import {
  type ClaimFilters,
  getClaim,
  getConversation,
  getItem,
  getMatch,
  getMe,
  getUnreadCount,
  type ItemFilters,
  listConversations,
  listItemMatches,
  listItems,
  listManagerClaims,
  listMessages,
  listMyClaims,
  listMyItems,
  listNotifications,
  type MatchFilters,
  type MyItemFilters,
  type NotificationFilters,
} from "./endpoints";
import { queryKeys } from "./query-keys";

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function useItems(filters: ItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.items(filters),
    queryFn: () => listItems(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useItem(itemId: string) {
  return useQuery({
    queryKey: queryKeys.item(itemId),
    queryFn: () => getItem(itemId),
    enabled: Boolean(itemId),
    staleTime: 60_000,
  });
}

export function useMyItems(filters: MyItemFilters = {}) {
  return useQuery({
    queryKey: queryKeys.myItems(filters),
    queryFn: () => listMyItems(filters),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });
}

export function useMyClaims(filters: ClaimFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.myClaims(filters),
    queryFn: () => listMyClaims(filters),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    enabled: options?.enabled ?? true,
  });
}

export function useClaim(claimId: string) {
  return useQuery({
    queryKey: queryKeys.claim(claimId),
    queryFn: () => getClaim(claimId),
    enabled: Boolean(claimId),
    staleTime: 20_000,
  });
}

export function useManagerClaims(filters: ClaimFilters = {}) {
  return useQuery({
    queryKey: queryKeys.managerClaims(filters),
    queryFn: () => listManagerClaims(filters),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useItemMatches(itemId: string, filters: MatchFilters = {}) {
  return useQuery({
    queryKey: queryKeys.itemMatches(itemId, filters),
    queryFn: () => listItemMatches(itemId, filters),
    enabled: Boolean(itemId),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });
}

export function useMatch(matchId: string) {
  return useQuery({
    queryKey: queryKeys.match(matchId),
    queryFn: () => getMatch(matchId),
    enabled: Boolean(matchId),
    staleTime: 20_000,
  });
}

export function useConversations(page = 1) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.conversations(page),
    queryFn: () => listConversations(page),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => getConversation(conversationId),
    enabled: Boolean(conversationId),
    staleTime: 20_000,
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: () => listMessages(conversationId, { limit: 50 }),
    enabled: Boolean(conversationId),
    staleTime: 10_000,
  });
}

export function useNotifications(filters: NotificationFilters = {}) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications(filters),
    queryFn: () => listNotifications(filters),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: getUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 45_000,
  });
}

export function useMe() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: getMe,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}
