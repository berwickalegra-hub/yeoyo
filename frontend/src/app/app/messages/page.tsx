// Messages inbox — list of conversations. Selecting one navigates to
// /app/messages/[id] (the thread view), which re-renders this same list in
// its left panel on desktop (lg:) breakpoints per the Banani Messages
// screen's two-pane layout; on mobile the thread is a full-screen push.
'use client';

import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { ConversationListItem } from '@/components/yeoyo/ConversationListItem';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { useConversations } from '@/lib/yeoyo/useConversations';

export default function MessagesPage() {
  const user = useUser();
  const badgeCounts = useNavCounts();
  const { conversations, loading } = useConversations();

  if (!user) return null;

  return (
    <AppShell active="messages" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="flex flex-1">
        <div className="flex w-full flex-col border-r border-border lg:w-96">
          <div className="border-b border-border px-5 py-5">
            <h1 className="font-headings text-xl font-bold text-foreground">Messages</h1>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">
            {loading && (
              <p className="px-5 py-3 font-body text-sm text-muted-foreground">Chargement…</p>
            )}
            {!loading && conversations.length === 0 && (
              <p className="px-5 py-3 font-body text-sm text-muted-foreground">
                Aucune conversation pour l’instant — accepte une demande de contact pour démarrer.
              </p>
            )}
            {!loading &&
              conversations.map((c) => (
                <ConversationListItem
                  key={c.id}
                  id={c.id}
                  otherUser={c.otherUser}
                  lastMessage={c.lastMessage}
                  unreadCount={c.unreadCount}
                />
              ))}
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
