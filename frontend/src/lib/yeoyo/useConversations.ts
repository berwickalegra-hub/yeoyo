'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Ably from 'ably';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useUser } from '@/contexts/AuthContext';
import { closeAblySafely, installAblyRejectionGuard } from '@/lib/yeoyo/ably-safe-close';
import type { ProfileCard } from '@/lib/yeoyo/types';

export interface ConversationRow {
  id: string;
  otherUser: ProfileCard;
  lastMessage: {
    body: string;
    hasImage: boolean;
    deleted: boolean;
    createdAt: string;
    fromSelf: boolean;
  } | null;
  unreadCount: number;
  muted: boolean;
}

// Live-updates the inbox: once the list loads, subscribes to every
// conversation's Ably channel (the same `conversation:{id}` channels the
// thread view uses, capability already scoped there by
// /api/realtime/token) and reloads on any new message/deletion — so the
// last-message preview, unread badge, and sort order all update without a
// page navigation (2026-08-14; previously this list was fetch-once and only
// refreshed on next full mount). Reload is debounced so a burst of messages
// across several conversations triggers one refetch, not N.
const RELOAD_DEBOUNCE_MS = 400;

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const user = useUser();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ conversations: ConversationRow[] }>('/api/conversations');
      setConversations(res.conversations);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user || conversations.length === 0) return;
    // Ably is a progressive enhancement here too — a missing ABLY_API_KEY
    // (or a failed connection) just means the list stays fetch-once, same
    // graceful degrade as the thread view.
    installAblyRejectionGuard();
    const ably = new Ably.Realtime({ authUrl: '/api/realtime/token', authMethod: 'POST' });
    ably.connection.on('failed', () => {
      // no-op
    });
    const channels = conversations.map((c) => ably.channels.get(`conversation:${c.id}`));
    function scheduleReload() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
    }
    try {
      for (const channel of channels) {
        channel.subscribe('message', scheduleReload);
        channel.subscribe('delete', scheduleReload);
      }
    } catch {
      // ignore — see comment above
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      closeAblySafely(ably);
    };
    // Deliberately keyed on `conversations.length`, not `conversations` —
    // re-subscribing on every field change (a new message bumps almost
    // every row) would tear down and reopen N Ably channels per update;
    // only the *set of conversation ids* changing needs new subscriptions,
    // and the debounced reload above already re-syncs the row content.
  }, [user, conversations.length]);

  return { conversations, loading, reload: load };
}
