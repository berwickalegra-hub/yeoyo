// Messages thread — real-time chat. Loads history via
// GET /api/conversations/[id]/messages, then subscribes to the Ably
// `conversation:{id}` channel (token minted by POST /api/realtime/token,
// scoped server-side to only this caller's own conversations) so new
// messages, read receipts, deletions, typing and presence all update
// without polling.
//
// Header (2026-08-10, user-driven — "comme WhatsApp avec des options
// professionnelles, le bouton bloquer ne doit pas être exposé comme ça"):
// Signaler/Bloquer moved from two always-visible buttons into a kebab (⋮)
// dropdown; the avatar+name are now clickable through to the full profile.
// Image sending uses the same upload-then-attach pattern as
// POST /api/profile/photos — see onImageSelected below.
//
// Feature-completion pass (2026-08-14, explicit user ask: "regarde toutes
// les fonctionnalités qui manquent [...] pour ne plus revenir là-dessus") —
// everything added here is backed by a real endpoint/DB field, nothing
// fabricated:
//   - Typing indicator + presence ("En ligne") — pure Ably client events
//     (publish/subscribe on the already-granted per-conversation channel),
//     no schema needed. Presence is scoped to "currently has this thread
//     open", not a global online status — the token only grants capability
//     per conversation channel, on purpose (see /api/realtime/token).
//   - Read receipts — `readAt` was already recorded server-side but never
//     surfaced; GET now returns it and the server publishes a `read` Ably
//     event when it marks messages read, so the sender sees ticks flip live.
//   - Message timestamps + date separators inside the thread (previously
//     only the inbox list had a time label).
//   - Delete/unsend own message (soft delete, `Message.deletedAt`) with a
//     live `delete` Ably event so both sides' open threads update at once.
//   - Mute (`PATCH /api/conversations/[id]/mute`) — suppresses
//     MESSAGE_RECEIVED notifications for this thread only.
//   - True optimistic send: the draft appends as a `pending` bubble before
//     the request resolves, flips to `failed` with a retry button on error
//     (previously: draft cleared immediately, bubble only appeared after a
//     successful response, and a failed send just showed a toast with the
//     text gone).
//   - Auto-load-older-on-scroll (scrolling near the top now loads the
//     previous page automatically, in addition to the load-more affordance)
//     with scroll-position preservation so the view doesn't jump.
//   - In-composer quota banner ("X messages restants aujourd'hui") reusing
//     `messageQuotaStatus()` — that data already existed and was shown on
//     Explorer's side panel, just never in the composer itself.
// Deliberately NOT built this pass (documented, not silently skipped):
// message reactions, edit-message, reply-to/quote a specific message,
// archive-conversation, and a true app-wide (not per-thread) online status —
// each would need its own schema/UX decision and the ask was scoped to
// "what a normal chat needs", which these are more marginal additions to.
'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import Ably, { type RealtimeChannel } from 'ably';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { TopNav } from '@/components/yeoyo/TopNav';
import { ConversationListItem } from '@/components/yeoyo/ConversationListItem';
import { COOKIE_PREFIX } from '@/lib/constants';
import { INTENT_LABELS } from '@/lib/yeoyo/types';
import { REPORT_REASONS } from '@/lib/yeoyo/constants';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { useConversations } from '@/lib/yeoyo/useConversations';
import { useLikePop } from '@/lib/yeoyo/useLikePop';

const QUICK_REPLIES = [
  'Bonjour ! J’ai beaucoup aimé ton profil, comment vas-tu ? 😊',
  'Salut ! Qu’est-ce qui t’a donné envie de rejoindre YeOyo ?',
  'Bonjour, ravi(e) de faire ta connaissance ! Tu es de quelle commune ?',
] as const;

const TYPING_PUBLISH_INTERVAL_MS = 2000;
const TYPING_DISPLAY_TIMEOUT_MS = 3000;

interface ThreadMessage {
  id: string;
  senderId: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  readAt: string | null;
  deleted: boolean;
  fromSelf: boolean;
  // Client-only optimistic-send state — never sent by the server.
  tempId?: string;
  pending?: boolean;
  failed?: boolean;
}

interface Quota {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

// api.ts doesn't export a CSRF-token getter (protected file), and the
// multipart /api/upload call can't go through api()'s JSON-only body — same
// workaround used by onboarding/profil for their own photo uploads.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const key = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return 'Aujourd’hui';
  if (sameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const { conversations, reload } = useConversations();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [liked, setLiked] = useState(false);
  const [addingLike, setAddingLike] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]['value'] | null>(
    null,
  );
  const [quota, setQuota] = useState<Quota | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherPresent, setOtherPresent] = useState(false);
  const [mutedOverride, setMutedOverride] = useState<boolean | null>(null);
  const [mutingBusy, setMutingBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const autoScrollRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const otherUserIdRef = useRef<string | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = conversations.find((c) => c.id === conversationId);
  const muted = mutedOverride ?? active?.muted ?? false;

  useEffect(() => {
    otherUserIdRef.current = active?.otherUser.userId ?? null;
  }, [active]);

  const likePopping = useLikePop(liked);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ messages: ThreadMessage[]; hasMore: boolean; quota: Quota }>(
        `/api/conversations/${conversationId}/messages`,
      );
      seenIds.current = new Set(res.messages.map((m) => m.id));
      setMessages(res.messages);
      setHasMore(res.hasMore);
      setQuota(res.quota);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [conversationId, toast]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Auto-scroll to the bottom on new messages (send/receive); preserve
  // scroll position instead when older history was prepended (loadOlder
  // flips autoScrollRef to false right before its setMessages call).
  useLayoutEffect(() => {
    if (autoScrollRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else if (prevScrollHeightRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevScrollHeightRef.current;
    }
    prevScrollHeightRef.current = 0;
    autoScrollRef.current = true;
  }, [messages]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

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
      channelRef.current = channel;

      channel.subscribe('message', (msg) => {
        const data = msg.data as ThreadMessage;
        if (seenIds.current.has(data.id)) return;
        seenIds.current.add(data.id);
        setMessages((prev) => [...prev, { ...data, fromSelf: data.senderId === user.id }]);
      });

      channel.subscribe('read', (msg) => {
        const data = msg.data as { readerId: string; readAt: string };
        if (data.readerId === user.id) return;
        setMessages((prev) =>
          prev.map((m) => (m.fromSelf && !m.readAt ? { ...m, readAt: data.readAt } : m)),
        );
      });

      channel.subscribe('delete', (msg) => {
        const data = msg.data as { id: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.id ? { ...m, deleted: true, body: '', imageUrl: null } : m,
          ),
        );
      });

      channel.subscribe('typing', (msg) => {
        const data = msg.data as { userId: string };
        if (data.userId === user.id) return;
        setOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(
          () => setOtherTyping(false),
          TYPING_DISPLAY_TIMEOUT_MS,
        );
      });

      channel.presence.enter().catch(() => {
        // ignore — presence is a progressive enhancement (see comment above)
      });
      channel.presence.subscribe('enter', (member) => {
        if (member.clientId === otherUserIdRef.current) setOtherPresent(true);
      });
      channel.presence.subscribe('leave', (member) => {
        if (member.clientId === otherUserIdRef.current) setOtherPresent(false);
      });
      channel.presence
        .get()
        .then((members) => {
          if (members?.some((m) => m.clientId === otherUserIdRef.current)) setOtherPresent(true);
        })
        .catch(() => {
          // ignore
        });
    } catch {
      // ignore — see comment above
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      channelRef.current = null;
      try {
        ably.channels
          .get(`conversation:${conversationId}`)
          .presence.leave()
          .catch(() => {});
        ably.close();
      } catch {
        // ignore — see comment above
      }
    };
  }, [conversationId, user]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    autoScrollRef.current = false;
    if (scrollRef.current) prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    try {
      const res = await api<{ messages: ThreadMessage[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.createdAt)}`,
      );
      for (const m of res.messages) seenIds.current.add(m.id);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoadingOlder(false);
    }
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < 80 && hasMore && !loadingOlder) void loadOlder();
  }

  function onDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (channelRef.current && now - lastTypingSentRef.current > TYPING_PUBLISH_INTERVAL_MS) {
      lastTypingSentRef.current = now;
      channelRef.current.publish('typing', { userId: user?.id }).catch(() => {
        // ignore — typing indicator is a progressive enhancement
      });
    }
  }

  function decrementQuota() {
    setQuota((q) =>
      q && q.limit !== null ? { ...q, remaining: Math.max((q.remaining ?? 1) - 1, 0) } : q,
    );
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending || !user) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        senderId: user.id,
        body,
        imageUrl: null,
        createdAt: new Date().toISOString(),
        readAt: null,
        deleted: false,
        fromSelf: true,
        pending: true,
      },
    ]);
    setDraft('');
    setSending(true);
    try {
      const res = await api<ThreadMessage>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { body },
      });
      seenIds.current.add(res.id);
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? res : m)));
      decrementQuota();
      void reload();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSending(false);
    }
  }

  async function retrySend(tempId: string) {
    const target = messages.find((m) => m.tempId === tempId);
    if (!target) return;
    setMessages((prev) =>
      prev.map((m) => (m.tempId === tempId ? { ...m, pending: true, failed: false } : m)),
    );
    try {
      const res = await api<ThreadMessage>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { body: target.body },
      });
      seenIds.current.add(res.id);
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? res : m)));
      decrementQuota();
      void reload();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function onImageSelected(file: File) {
    setUploadingImage(true);
    const caption = draft.trim();
    setDraft('');
    try {
      const form = new FormData();
      form.append('file', file);
      const csrfToken = readCsrfToken();
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });
      if (!uploadRes.ok) {
        const errBody = (await uploadRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? "L'envoi de l'image a échoué");
      }
      const uploaded = (await uploadRes.json()) as { id: string };

      const res = await api<ThreadMessage>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { imageUploadId: uploaded.id, ...(caption ? { body: caption } : {}) },
      });
      if (!seenIds.current.has(res.id)) {
        seenIds.current.add(res.id);
        setMessages((prev) => [...prev, res]);
      }
      decrementQuota();
      void reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setUploadingImage(false);
    }
  }

  async function deleteMessage(id: string) {
    setDeletingId(id);
    try {
      await api(`/api/conversations/${conversationId}/messages/${id}`, { method: 'DELETE' });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, deleted: true, body: '', imageUrl: null } : m)),
      );
      setConfirmDeleteId(null);
      void reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleMute() {
    setMutingBusy(true);
    try {
      const res = await api<{ muted: boolean }>(`/api/conversations/${conversationId}/mute`, {
        method: 'PATCH',
      });
      setMutedOverride(res.muted);
      toast(
        res.muted ? 'Notifications coupées pour cette conversation' : 'Notifications réactivées',
        'success',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setMutingBusy(false);
    }
  }

  async function addLike() {
    if (!active) return;
    setAddingLike(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId: active.otherUser.userId } });
      setLiked(true);
      toast('Profil aimé', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setAddingLike(false);
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

  let lastDateKey = '';

  return (
    <div className="flex h-screen flex-col bg-background font-body">
      <TopNav active="messages" user={{ name: user.email }} badgeCounts={badgeCounts} />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-96 flex-col border-r border-border lg:flex">
          <div className="border-b border-border px-5 py-5">
            <h1 className="font-headings text-xl font-bold text-foreground">Messages</h1>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">
            {conversations.map((c) => (
              <ConversationListItem
                key={c.id}
                id={c.id}
                otherUser={c.otherUser}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                muted={c.muted}
                active={c.id === conversationId}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <a href="/app/messages" className="lg:hidden">
                <Icon name="chevron-left" size={20} />
              </a>
              {active && (
                <Link
                  href={`/app/profils/${active.otherUser.userId}`}
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <div className="relative flex-shrink-0">
                    <UserAvatar
                      name={active.otherUser.firstName}
                      avatarUrl={active.otherUser.photoUrl}
                      size={38}
                    />
                    {otherPresent && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-secondary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate font-headings text-base font-bold text-foreground">
                      {active.otherUser.firstName}
                    </span>
                    {(otherTyping || otherPresent) && (
                      <span className="block truncate font-body text-xs text-secondary">
                        {otherTyping ? 'en train d’écrire…' : 'En ligne'}
                      </span>
                    )}
                  </div>
                </Link>
              )}
            </div>
            {active && (
              <div ref={menuRef} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Options de la conversation"
                  aria-expanded={menuOpen}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Icon name="more-vertical" size={18} />
                </button>
                {menuOpen && (
                  <div className="animate-scale-in absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                    <Link
                      href={`/app/profils/${active.otherUser.userId}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 font-body text-sm text-foreground hover:bg-muted/50"
                    >
                      <Icon name="user" size={15} />
                      Voir le profil
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void toggleMute();
                      }}
                      disabled={mutingBusy}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left font-body text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
                    >
                      <Icon name={muted ? 'bell' : 'bell-off'} size={15} />
                      {muted ? 'Réactiver les notifications' : 'Couper les notifications'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setReportReason(reportReason === null ? 'OTHER' : null);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left font-body text-sm text-foreground hover:bg-muted/50"
                    >
                      <Icon name="info" size={15} />
                      Signaler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmingBlock(true);
                      }}
                      className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-left font-body text-sm text-red-500 hover:bg-red-500/5"
                    >
                      <Icon name="ban" size={15} />
                      Bloquer
                    </button>
                  </div>
                )}
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

          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
            {loadingOlder && (
              <p className="mb-3 text-center font-body text-xs text-muted-foreground">
                Chargement des messages précédents…
              </p>
            )}
            {!loadingOlder && hasMore && (
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
            <div className="flex flex-col gap-1">
              {messages.map((m) => {
                const dateKey = new Date(m.createdAt).toDateString();
                const showDateSeparator = dateKey !== lastDateKey;
                lastDateKey = dateKey;

                return (
                  <div key={m.id}>
                    {showDateSeparator && (
                      <div className="my-3 flex items-center justify-center">
                        <span className="rounded-full bg-muted px-3 py-1 font-body text-[11px] font-medium text-muted-foreground">
                          {dayLabel(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${m.fromSelf ? 'justify-end' : 'justify-start'} mb-1`}>
                      <div
                        className={`flex max-w-[75%] flex-col ${m.fromSelf ? 'items-end' : 'items-start'}`}
                      >
                        {m.deleted ? (
                          <div className="rounded-2xl border border-border bg-surface px-4 py-2.5 font-body text-sm italic text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Icon name="ban" size={12} />
                              Message supprimé
                            </span>
                          </div>
                        ) : (
                          <div
                            className={`overflow-hidden rounded-2xl font-body text-sm ${
                              m.imageUrl ? 'p-1' : 'px-4 py-2.5'
                            } ${m.fromSelf ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground'} ${m.pending ? 'opacity-60' : ''} ${m.failed ? 'border-2 border-red-400' : ''}`}
                          >
                            {m.imageUrl && (
                              <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                                <Image
                                  src={m.imageUrl}
                                  alt="Image envoyée"
                                  width={280}
                                  height={280}
                                  className="max-h-72 w-full rounded-xl object-cover"
                                />
                              </a>
                            )}
                            {m.body && <p className={m.imageUrl ? 'px-2.5 py-2' : ''}>{m.body}</p>}
                          </div>
                        )}

                        {confirmDeleteId === m.id ? (
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void deleteMessage(m.id)}
                              disabled={deletingId === m.id}
                              className="font-body text-[11px] font-semibold text-red-500 disabled:opacity-50"
                            >
                              {deletingId === m.id ? 'Suppression…' : 'Confirmer'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="font-body text-[11px] text-muted-foreground"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          !m.deleted && (
                            <div className="mt-0.5 flex items-center gap-1.5 px-1">
                              {m.failed ? (
                                <button
                                  type="button"
                                  onClick={() => m.tempId && void retrySend(m.tempId)}
                                  className="flex items-center gap-1 font-body text-[11px] font-semibold text-red-500"
                                >
                                  <Icon name="refresh-cw" size={10} />
                                  Échec — réessayer
                                </button>
                              ) : (
                                <span className="font-body text-[11px] text-muted-foreground">
                                  {m.pending ? 'Envoi…' : timeOfDay(m.createdAt)}
                                </span>
                              )}
                              {m.fromSelf && !m.pending && !m.failed && (
                                <Icon
                                  name={m.readAt ? 'check-circle' : 'check'}
                                  size={11}
                                  className={m.readAt ? 'text-secondary' : 'text-muted-foreground'}
                                />
                              )}
                              {m.fromSelf && !m.pending && !m.failed && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(m.id)}
                                  aria-label="Supprimer ce message"
                                  className="text-muted-foreground/60 transition-colors hover:text-red-500"
                                >
                                  <Icon name="trash" size={11} />
                                </button>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            {quota && quota.limit !== null && (
              <div
                className={`mb-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-body text-xs ${
                  (quota.remaining ?? 0) <= 0
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-gold/10 text-gold'
                }`}
              >
                <span>
                  {(quota.remaining ?? 0) <= 0
                    ? 'Limite de messages gratuits atteinte pour aujourd’hui'
                    : `${quota.remaining} message${(quota.remaining ?? 0) > 1 ? 's' : ''} restant${(quota.remaining ?? 0) > 1 ? 's' : ''} aujourd’hui`}
                </span>
                <Link
                  href="/app/premium"
                  className="flex flex-shrink-0 items-center gap-1 font-semibold"
                >
                  <Icon name="crown" size={12} />
                  Premium
                </Link>
              </div>
            )}
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
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImageSelected(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                aria-label="Envoyer une image"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-transform active:scale-90 disabled:opacity-50"
              >
                <Icon name="image" size={18} />
              </button>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={uploadingImage ? 'Envoi de l’image…' : 'Écris un message…'}
                disabled={uploadingImage}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || uploadingImage || !draft.trim()}
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
                  disabled={liked || addingLike}
                  className={`btn-success-flash flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 font-body text-sm font-medium ${addingLike ? 'opacity-50' : ''} ${liked ? 'border-primary/30 bg-primary/20 text-primary' : 'border-border bg-background text-foreground'}`}
                >
                  {addingLike ? (
                    <Icon name="refresh-cw" size={14} className="animate-spin" />
                  ) : (
                    <Icon
                      name="heart"
                      size={14}
                      fill={liked ? 'currentColor' : 'none'}
                      className={likePopping ? 'animate-heart-pop' : ''}
                    />
                  )}
                  {liked ? 'Profil aimé' : 'Ajouter un like'}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleMute()}
                  disabled={mutingBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Icon name={muted ? 'bell' : 'bell-off'} size={14} />
                  {muted ? 'Réactiver les notifications' : 'Couper les notifications'}
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
