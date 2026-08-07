// Messages thread — real-time chat. Loads history via
// GET /api/conversations/[id]/messages, then subscribes to the Ably
// `conversation:{id}` channel (token minted by POST /api/realtime/token,
// scoped server-side to only this caller's own conversations) so new
// messages from the other side appear without polling — the "temps réel
// dès le départ" requirement. Sending is a plain POST; the just-sent
// message is appended optimistically from the POST response, then deduped
// by id if/when the same message also arrives over Ably.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Ably from 'ably';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Sidebar } from '@/components/yeoyo/Sidebar';
import { ConversationListItem } from '@/components/yeoyo/ConversationListItem';
import { INTENT_LABELS } from '@/lib/yeoyo/types';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { useConversations } from '@/lib/yeoyo/useConversations';

const QUICK_REPLIES = [
  'Bonjour ! J’ai beaucoup aimé ton profil, comment vas-tu ? 😊',
  'Salut ! Qu’est-ce qui t’a donné envie de rejoindre YeOyo ?',
  'Bonjour, ravi(e) de faire ta connaissance ! Tu es de quelle commune ?',
] as const;

const REPORT_REASONS = [
  { value: 'FAKE_PROFILE', label: 'Faux profil' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Contenu inapproprié' },
  { value: 'HARASSMENT', label: 'Harcèlement' },
  { value: 'SCAM', label: 'Arnaque' },
  { value: 'OTHER', label: 'Autre' },
] as const;

interface ThreadMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  fromSelf: boolean;
}

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const { conversations } = useConversations();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]['value'] | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const active = conversations.find((c) => c.id === conversationId);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ messages: ThreadMessage[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}/messages`,
      );
      seenIds.current = new Set(res.messages.map((m) => m.id));
      setMessages(res.messages);
      setHasMore(res.hasMore);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [conversationId, toast]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!user) return;
    // Realtime is a progressive enhancement — the thread already works via
    // plain GET/POST above. Without ABLY_API_KEY configured server-side,
    // /api/realtime/token returns 503 and this connection never
    // authenticates; Ably then throws when closed during unmount. Swallow
    // both so a missing (optional) Ably key never crashes the chat screen.
    const ably = new Ably.Realtime({ authUrl: '/api/realtime/token', authMethod: 'POST' });
    ably.connection.on('failed', () => {
      // no-op — sending/receiving still works over REST, just not live-pushed
    });
    try {
      const channel = ably.channels.get(`conversation:${conversationId}`);
      channel.subscribe('message', (msg) => {
        const data = msg.data as ThreadMessage;
        if (seenIds.current.has(data.id)) return;
        seenIds.current.add(data.id);
        setMessages((prev) => [...prev, { ...data, fromSelf: data.senderId === user.id }]);
      });
    } catch {
      // ignore — see comment above
    }
    return () => {
      try {
        ably.close();
      } catch {
        // ignore — see comment above
      }
    };
  }, [conversationId, user]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    try {
      const res = await api<{ messages: ThreadMessage[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.createdAt)}`,
      );
      for (const m of res.messages) seenIds.current.add(m.id);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      const res = await api<ThreadMessage>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { body },
      });
      if (!seenIds.current.has(res.id)) {
        seenIds.current.add(res.id);
        setMessages((prev) => [...prev, res]);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSending(false);
    }
  }

  async function addLike() {
    if (!active) return;
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId: active.otherUser.userId } });
      setLiked(true);
      toast('Profil aimé', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function blockUser() {
    if (!active) return;
    try {
      await api(`/api/users/${active.otherUser.userId}/block`, { method: 'POST' });
      toast('Utilisateur bloqué', 'success');
      router.push('/app/messages');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function submitReport() {
    if (!active || !reportReason) return;
    try {
      await api('/api/reports', {
        method: 'POST',
        body: { targetUserId: active.otherUser.userId, reason: reportReason },
      });
      toast('Signalement envoyé — notre équipe va l’examiner', 'success');
      setReportReason(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background font-body">
      <Sidebar active="messages" user={{ name: user.email }} badgeCounts={badgeCounts} />

      <div className="flex flex-1">
        <div className="hidden w-96 flex-col border-r border-border lg:flex">
          <div className="border-b border-border px-5 py-5">
            <h1 className="font-headings text-xl font-bold text-foreground">Messages</h1>
          </div>
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
            {conversations.map((c) => (
              <ConversationListItem
                key={c.id}
                id={c.id}
                otherUser={c.otherUser}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                active={c.id === conversationId}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <a href="/app/messages" className="lg:hidden">
                <Icon name="chevron-left" size={20} />
              </a>
              {active && (
                <span className="font-headings text-base font-bold text-foreground">
                  {active.otherUser.firstName}
                </span>
              )}
            </div>
            {active && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReportReason(reportReason === null ? 'OTHER' : null)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 font-body text-xs text-muted-foreground"
                >
                  Signaler
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(true)}
                  className="rounded-lg border border-red-500/40 bg-surface px-3 py-1.5 font-body text-xs text-red-500"
                >
                  Bloquer
                </button>
              </div>
            )}
          </div>

          {reportReason !== null && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-3">
              <select
                value={reportReason}
                onChange={(e) =>
                  setReportReason(e.target.value as (typeof REPORT_REASONS)[number]['value'])
                }
                className="rounded-lg border border-border bg-background px-2 py-1.5 font-body text-xs text-foreground"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void submitReport()}
                className="rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground"
              >
                Envoyer le signalement
              </button>
              <button
                type="button"
                onClick={() => setReportReason(null)}
                className="font-body text-xs text-muted-foreground"
              >
                Annuler
              </button>
            </div>
          )}

          {confirmingBlock && (
            <div className="flex flex-wrap items-center gap-3 border-b border-red-500/40 bg-red-500/5 px-5 py-3">
              <p className="font-body text-xs text-muted-foreground">
                Bloquer {active?.otherUser.firstName} ? Vous ne pourrez plus vous envoyer de
                messages.
              </p>
              <button
                type="button"
                onClick={() => void blockUser()}
                className="rounded-lg bg-red-500 px-3 py-1.5 font-body text-xs font-semibold text-white"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBlock(false)}
                className="font-body text-xs text-muted-foreground"
              >
                Annuler
              </button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
            {hasMore && (
              <button
                type="button"
                onClick={loadOlder}
                className="mx-auto mb-4 block rounded-lg border border-border px-4 py-1.5 font-body text-xs text-muted-foreground"
              >
                Charger les messages précédents
              </button>
            )}
            {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}
            {!loading && messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Icon name="message-circle" size={28} className="text-muted-foreground" />
                <p className="font-body text-sm text-muted-foreground">
                  {active
                    ? `Dis bonjour à ${active.otherUser.firstName} pour démarrer la conversation.`
                    : 'Démarrez la conversation.'}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.fromSelf ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 font-body text-sm ${
                      m.fromSelf
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface text-foreground'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            {!loading && messages.length === 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_REPLIES.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setDraft(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-left font-body text-xs text-muted-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Écris un message…"
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Envoyer"
              >
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
        </div>

        {active && (
          <div className="hidden w-72 flex-col border-l border-border bg-surface lg:flex">
            <div className="border-b border-border px-5 py-5 text-center">
              <UserAvatar
                name={active.otherUser.firstName}
                avatarUrl={active.otherUser.photoUrl}
                size={64}
                className="mx-auto mb-3"
              />
              <h2 className="font-headings text-lg font-bold text-foreground">
                {active.otherUser.firstName}
              </h2>
              <p className="mt-0.5 font-body text-sm text-muted-foreground">
                {active.otherUser.age} ans
                {active.otherUser.job ? ` · ${active.otherUser.job}` : ''}
              </p>
              {active.otherUser.verified && (
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                  <span className="font-body text-xs text-foreground">Profil vérifié</span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              <div>
                <p className="mb-2 font-body text-xs uppercase tracking-widest text-muted-foreground">
                  À propos
                </p>
                <div className="flex flex-col gap-2">
                  {active.otherUser.commune && (
                    <div className="flex items-center gap-2">
                      <Icon name="map-pin" size={14} />
                      <span className="font-body text-sm text-foreground">
                        {active.otherUser.commune}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Icon name="gem" size={14} />
                    <span className="font-body text-sm text-foreground">
                      {INTENT_LABELS[active.otherUser.intent] ?? active.otherUser.intent}
                    </span>
                  </div>
                  {active.otherUser.tags.map((tag) => (
                    <div key={tag} className="flex items-center gap-2">
                      <Icon name="heart" size={14} />
                      <span className="font-body text-sm text-foreground">{tag}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void addLike()}
                  disabled={liked}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Icon name="heart" size={14} />
                  {liked ? 'Profil aimé' : 'Ajouter un like'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-background/50 px-4 py-2 font-body text-sm font-medium text-red-400"
                >
                  <Icon name="ban" size={14} />
                  Bloquer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
