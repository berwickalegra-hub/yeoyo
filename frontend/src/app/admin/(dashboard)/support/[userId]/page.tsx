// Admin — Support thread detail. Full history for one end user + a reply
// composer (text + optional screenshot). Opening this page (the GET call)
// bulk-marks the user's unread messages as seen server-side — see
// GET /api/admin/support/[userId]'s own comment.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { COOKIE_PREFIX } from '@/lib/constants';

interface SupportMsg {
  id: string;
  senderRole: 'USER' | 'ADMIN';
  senderId: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

interface ThreadResponse {
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  messages: SupportMsg[];
}

function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const key = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function uploadImageWithAuthRetry(file: File): Promise<string> {
  async function attempt(): Promise<Response> {
    const form = new FormData();
    form.append('file', file);
    const csrfToken = readCsrfToken();
    return fetch('/api/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
  }

  let res = await attempt();
  if (res.status === 401) {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);
    if (refreshRes?.ok) {
      const refreshBody = (await refreshRes.json().catch(() => ({}))) as { csrfToken?: string };
      if (refreshBody.csrfToken) storeCsrfToken(refreshBody.csrfToken);
      res = await attempt();
    } else {
      throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "L'envoi de l'image a échoué. Réessaie.");
  }
  const uploaded = (await res.json()) as { id: string };
  return uploaded.id;
}

export default function AdminSupportThreadPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ThreadResponse>(`/api/admin/support/${params.userId}`);
      setThread(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast('Utilisateur introuvable', 'error');
        router.replace('/admin/support');
        return;
      }
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [params.userId, toast, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [thread]);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingImage(file);
    e.target.value = '';
  }

  async function send() {
    const content = draft.trim();
    if ((!content && !pendingImage) || sending) return;
    setSending(true);
    try {
      let imageUploadId: string | undefined;
      if (pendingImage) {
        imageUploadId = await uploadImageWithAuthRetry(pendingImage);
      }
      const res = await api<{ message: SupportMsg }>(`/api/admin/support/${params.userId}/reply`, {
        method: 'POST',
        body: { ...(content ? { content } : {}), ...(imageUploadId ? { imageUploadId } : {}) },
      });
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
      setDraft('');
      setPendingImage(null);
    } catch (err) {
      toast(
        err instanceof ApiError || err instanceof Error ? err.message : 'Une erreur est survenue',
        'error',
      );
    } finally {
      setSending(false);
    }
  }

  if (loading || !thread) {
    return <p className="font-body text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/support')}
          aria-label="Retour"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <UserAvatar
          name={thread.user.name ?? thread.user.email}
          avatarUrl={thread.user.avatarUrl}
          size={36}
        />
        <div>
          <p className="font-body text-sm font-semibold text-foreground">
            {thread.user.name ?? thread.user.email}
          </p>
          <p className="font-body text-xs text-muted-foreground">{thread.user.email}</p>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-4"
      >
        {thread.messages.length === 0 && (
          <p className="text-center font-body text-sm text-muted-foreground">
            Aucun message pour l&rsquo;instant.
          </p>
        )}
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.senderRole === 'ADMIN' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`flex max-w-[70%] flex-col gap-1.5 rounded-2xl px-3.5 py-2 font-body text-sm ${
                m.senderRole === 'ADMIN'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground'
              }`}
            >
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  alt="Capture d'écran envoyée"
                  className="max-h-64 w-full rounded-lg object-cover"
                />
              )}
              {m.content && <span>{m.content}</span>}
              <span className="font-body text-[10px] opacity-70">
                {new Date(m.createdAt).toLocaleString('fr-FR')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Icon name="image" size={14} className="text-muted-foreground" />
            <span className="flex-1 truncate font-body text-xs text-muted-foreground">
              {pendingImage.name}
            </span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              aria-label="Retirer l'image"
              className="text-muted-foreground"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={onPickImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Joindre une capture d'écran"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground disabled:opacity-50"
          >
            <Icon name="camera" size={16} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            disabled={sending}
            placeholder="Répondre…"
            className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 font-body text-sm text-foreground disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || (!draft.trim() && !pendingImage)}
            aria-label="Envoyer"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
