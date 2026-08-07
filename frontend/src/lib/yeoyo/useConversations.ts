'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import type { ProfileCard } from '@/lib/yeoyo/types';

export interface ConversationRow {
  id: string;
  otherUser: ProfileCard;
  lastMessage: { body: string; createdAt: string; fromSelf: boolean } | null;
  unreadCount: number;
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

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

  return { conversations, loading, reload: load };
}
