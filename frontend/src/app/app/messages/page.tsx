// Messages inbox — list of conversations. Selecting one navigates to
// /app/messages/[id] (the thread view), which re-renders this same list in
// its left panel on desktop (lg:) breakpoints per the Banani Messages
// screen's two-pane layout; on mobile the thread is a full-screen push.
//
// Search added 2026-08-14 — client-side filter over the already-fully-loaded
// list (GET /api/conversations has no pagination yet, see STATUS.md), so no
// extra request is needed; filters on the other participant's first name.
'use client';

import { useMemo, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { ConversationListItem } from '@/components/yeoyo/ConversationListItem';
import { MessageListSkeleton } from '@/components/yeoyo/MessageListSkeleton';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { useConversations } from '@/lib/yeoyo/useConversations';

export default function MessagesPage() {
  const user = useUser();
  const badgeCounts = useNavCounts();
  const { conversations, loading } = useConversations();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.otherUser.firstName.toLowerCase().includes(q));
  }, [conversations, search]);

  if (!user) return null;

  return (
    <AppShell
      active="messages"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="flex flex-1">
        <div className="flex w-full flex-col border-r border-border lg:w-96">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-5">
            <h1 className="font-headings text-xl font-bold text-foreground">Messages</h1>
          </div>
          {conversations.length > 0 && (
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <Icon name="search" size={15} className="flex-shrink-0 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une conversation…"
                  className="w-full bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            </div>
          )}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {loading && (
              <div className="px-4 py-3">
                <MessageListSkeleton count={4} />
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <p className="px-5 py-3 font-body text-sm text-muted-foreground">
                Aucune conversation pour l’instant — accepte une demande de contact pour démarrer.
              </p>
            )}
            {!loading && conversations.length > 0 && filtered.length === 0 && (
              <p className="px-5 py-3 font-body text-sm text-muted-foreground">
                Aucune conversation ne correspond à « {search} ».
              </p>
            )}
            {!loading && filtered.length > 0 && (
              <div className="animate-fade-in flex flex-col">
                {filtered.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    id={c.id}
                    otherUser={c.otherUser}
                    lastMessage={c.lastMessage}
                    unreadCount={c.unreadCount}
                    muted={c.muted}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hidden flex-1 flex-col items-center justify-center gap-3 lg:flex">
          <Icon name="message-circle" size={40} className="text-muted-foreground" />
          <p className="font-body text-sm text-muted-foreground">
            Sélectionne une conversation pour l’ouvrir
          </p>
        </div>
      </div>
    </AppShell>
  );
}
