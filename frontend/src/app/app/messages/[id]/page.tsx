// Messages thread — real-time chat. Loads history via
// GET /api/conversations/[id]/messages, then subscribes to the Ably
// `conversation:{id}` channel (token minted by POST /api/realtime/token,
// scoped server-side to only this caller's own conversations) so new
// messages from the other side appear without polling — the "temps réel
// dès le départ" requirement. Sending is a plain POST; the just-sent
// message is appended optimistically from the POST response, then deduped
// by id if/when the same message also arrives over Ably.
//
// Header (2026-08-10, user-driven — "comme WhatsApp avec des options
// professionnelles, le bouton bloquer ne doit pas être exposé comme ça"):
// Signaler/Bloquer moved from two always-visible buttons into a kebab (⋮)
// dropdown; the avatar+name are now clickable through to the full profile.
// Image sending uses the same upload-then-attach pattern as
// POST /api/profile/photos — see onImageSelected below.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import Ably from 'ably';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Sidebar } from '@/components/yeoyo/Sidebar';
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

interface ThreadMessage {
  id: string;
  senderId: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  fromSelf: boolean;
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [liked, setLiked] = useState(false);
  const [addingLike, setAddingLike] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]['value'] | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const active = conversations.find((c) => c.id === conversationId);

  const likePopping = useLikePop(liked);

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
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setUploadingImage(false);
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

  return (
    <div className="flex min-h-screen bg-background font-body">
      <Sidebar active="messages" user={{ name: user.email }} badgeCounts={badgeCounts} />

      <div className="flex flex-1">
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
                  <UserAvatar
                    name={active.otherUser.firstName}
                    avatarUrl={active.otherUser.photoUrl}
                    size={38}
                  />
                  <span className="truncate font-headings text-base font-bold text-foreground">
                    {active.otherUser.firstName}
                  </span>
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
                  <div className="animate-scale-in absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
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
                    className={`max-w-[75%] overflow-hidden rounded-2xl font-body text-sm ${
                      m.imageUrl ? 'p-1' : 'px-4 py-2.5'
                    } ${m.fromSelf ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground'}`}
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
                onChange={(e) => setDraft(e.target.value)}
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
                  className={`btn-success-flash flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 font-body text-sm font-medium disabled:opacity-50 ${liked ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-background text-foreground'}`}
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
