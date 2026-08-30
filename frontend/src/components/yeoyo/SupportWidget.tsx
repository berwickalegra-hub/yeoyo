'use client';

// Floating "Support" chat — mounted once in AppShell, on every screen except
// Découvrir/Explorer (see AppShell's `showCoach` prop — that screen already
// stacks a raised nav FAB + the SwipeCard's own action row + swipe gestures,
// one floating element too many, 2026-08-17 explicit user report).
//
// 2026-08-29 (explicit user ask): replaces the previous "Coach" AI-assistant
// floating button — same bubble→slide-up-panel UX, but instead of an AI
// chat, a real message lands in the admin dashboard's Support inbox
// (/admin/support) so a human can read and reply. No quota (contacting
// support is always free) and no AI involved. The Coach feature's own code
// (CoachWidget.tsx, /api/coach/messages, CoachMessage table) is left intact
// and just unmounted, not deleted — cheap to bring back if ever wanted.
//
// Screenshot attachment: same upload-then-attach flow every other image
// send in this app uses (POST /api/upload → reference the returned id) —
// the raw multipart fetch bypasses api.ts's JSON-only body, same
// documented workaround as onboarding/profil and the messages thread.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { COOKIE_PREFIX } from '@/lib/constants';

interface SupportMsg {
  id: string;
  senderRole: 'USER' | 'ADMIN';
  content: string;
  imageUrl: string | null;
  createdAt: string;
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

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);

  // Refetch on every open, not just the first — an admin reply sent while
  // the panel was closed must show up the next time it's reopened, not only
  // after a full page reload (2026-08-30, explicit user ask to make sure
  // every part of this widget actually works, not just its first open).
  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    if (open) draftInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ messages: SupportMsg[] }>('/api/support/messages');
      setMessages(res.messages);
      setError(null);
    } catch {
      setError('Impossible de charger tes messages pour le moment.');
    } finally {
      setLoading(false);
    }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingImage(file);
    e.target.value = '';
  }

  async function send() {
    const content = draft.trim();
    if ((!content && !pendingImage) || sending) return;
    setSending(true);
    setError(null);
    try {
      let imageUploadId: string | undefined;
      if (pendingImage) {
        imageUploadId = await uploadImageWithAuthRetry(pendingImage);
      }
      const res = await api<{ message: SupportMsg }>('/api/support/messages', {
        method: 'POST',
        body: { ...(content ? { content } : {}), ...(imageUploadId ? { imageUploadId } : {}) },
      });
      setMessages((prev) => [...prev, res.message]);
      setDraft('');
      setPendingImage(null);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'Une erreur est survenue',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Contacter le support"
        className={`fixed bottom-36 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform active:scale-90 md:bottom-6 md:right-6 ${open ? 'hidden' : 'flex'}`}
      >
        <Icon name="life-buoy" size={24} />
      </button>

      {open && (
        <div className="animate-fade-in-up fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col rounded-t-2xl border border-border bg-surface shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:h-[32rem] md:w-96 md:rounded-2xl md:animate-scale-in">
          <div className="flex items-center justify-between rounded-t-2xl bg-primary px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Icon name="life-buoy" size={18} />
              </div>
              <div>
                <p className="font-headings text-sm font-semibold">Support</p>
                <p className="font-body text-xs opacity-80">On te répond dès que possible</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le support"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20"
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
            {loading && messages.length === 0 && (
              <p className="text-center font-body text-sm text-muted-foreground">Chargement…</p>
            )}

            {!loading && messages.length === 0 && (
              <p className="text-center font-body text-sm text-muted-foreground">
                Un souci, une question ? Écris-nous — tu peux aussi joindre une capture
                d&rsquo;écran.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.senderRole === 'USER' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex max-w-[80%] flex-col gap-1.5 rounded-2xl px-3.5 py-2 font-body text-sm ${
                      m.senderRole === 'USER'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground'
                    }`}
                  >
                    {m.imageUrl && (
                      <img
                        src={m.imageUrl}
                        alt="Capture d'écran envoyée"
                        className="max-h-48 w-full rounded-lg object-cover"
                      />
                    )}
                    {m.content && <span>{m.content}</span>}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p role="alert" className="mt-3 text-center font-body text-xs text-red-500">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-border p-3">
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
                ref={draftInputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send();
                }}
                disabled={sending}
                placeholder="Écrivez votre message…"
                className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 font-body text-sm text-foreground disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || (!draft.trim() && !pendingImage)}
                aria-label="Envoyer"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
              >
                {sending ? (
                  <Icon name="refresh-cw" size={16} className="animate-spin" />
                ) : (
                  <Icon name="send" size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
