'use client';

// "Équipe YeOyo" thread — the SupportMessage thread (admin ↔ user) rendered
// as a real conversation inside the Messages space. This is where a
// moderation notice or any admin message lands, and where the user replies.
// Same GET/POST /api/support/messages the floating SupportWidget uses
// (text-only here — screenshots still go through the widget).

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface TeamMsg {
  id: string;
  senderRole: 'USER' | 'ADMIN';
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

const SEEN_KEY = 'yeoyo.team.seenAt';

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export default function EquipeThreadPage() {
  const user = useUser();
  const badgeCounts = useNavCounts();
  const [messages, setMessages] = useState<TeamMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api<{ messages: TeamMsg[] }>('/api/support/messages');
      setMessages(res.messages);
      markSeen();
    } catch {
      setLoadError('Impossible de charger la conversation. Réessaie.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api<{ message: TeamMsg }>('/api/support/messages', {
        method: 'POST',
        body: { content },
      });
      setMessages((prev) => [...prev, res.message]);
      setDraft('');
    } catch (err) {
      setSendError(
        err instanceof ApiError
          ? err.message
          : "L'envoi a échoué. Vérifie ta connexion et réessaie.",
      );
    } finally {
      setSending(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="messages"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
      showCoach={false}
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Link
            href="/app/messages"
            aria-label="Retour aux messages"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Icon name="chevron-left" size={18} />
          </Link>
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Icon name="shield-check" size={19} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-headings text-base font-bold text-foreground">Équipe YeOyo</h1>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-body text-[10px] font-bold uppercase text-primary">
                Officiel
              </span>
            </div>
            <p className="font-body text-xs text-muted-foreground">Modération &amp; support</p>
          </div>
        </div>

        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-5">
          {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}
          {loadError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
              <p className="font-body text-sm text-red-600">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 font-body text-xs font-semibold text-primary"
              >
                Réessayer
              </button>
            </div>
          )}
          {!loading && !loadError && messages.length === 0 && (
            <div className="mx-auto mt-6 max-w-sm text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="shield-check" size={26} />
              </span>
              <p className="mt-3 font-headings text-sm font-semibold text-foreground">
                Aucun message pour l&rsquo;instant
              </p>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Une question sur ton compte, ton profil ou un paiement ? Écris-nous ici, on te
                répond dans cette conversation.
              </p>
            </div>
          )}
          {messages.map((m) => {
            const mine = m.senderRole === 'USER';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 font-body text-sm leading-relaxed ${
                    mine
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md border border-border bg-surface text-foreground'
                  }`}
                >
                  {m.imageUrl && (
                    // Support screenshot — one-off review image, next/image adds no value.
                    <img
                      src={m.imageUrl}
                      alt="Pièce jointe"
                      className="mb-1.5 max-h-56 w-full rounded-lg object-cover"
                    />
                  )}
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={onSend} className="flex items-end gap-2 border-t border-border px-4 py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void onSend(e as unknown as FormEvent);
              }
            }}
            rows={1}
            placeholder="Écris ton message…"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Envoyer"
            className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
          >
            <Icon
              name={sending ? 'refresh-cw' : 'send'}
              size={17}
              className={sending ? 'animate-spin' : ''}
            />
          </button>
        </form>
        {sendError && <p className="px-5 pb-3 font-body text-xs text-red-500">{sendError}</p>}
      </div>
    </AppShell>
  );
}
