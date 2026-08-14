'use client';

// Floating "Coach" chat — app-wide (mounted once in AppShell), inspired by
// a competitor app's coach bubble (2026-08-10, user-driven). Free tier:
// 3 questions/day (server-enforced, see /api/coach/messages); ACTIVE
// subscribers are unlimited. Entirely inert (friendly "not configured"
// state, no crash) when the backend has no ANTHROPIC_API_KEY — same
// optional-provider pattern as Cloudinary/Resend/Ably elsewhere in this
// kit. Positioned high enough (`bottom-36` mobile) to never collide with
// Explorer's SwipeCard fixed action bar, which also sits above the mobile
// tab bar on that one screen.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';

interface CoachMsg {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
}

interface QuotaInfo {
  configured: boolean;
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
}

export function CoachWidget() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<CoachMsg[]>([]);
  const [quota, setQuota] = useState<QuotaInfo>({
    configured: true,
    remaining: null,
    limit: null,
    resetAt: null,
  });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ messages: CoachMsg[] } & QuotaInfo>('/api/coach/messages');
      setMessages(res.messages);
      setQuota({
        configured: res.configured,
        remaining: res.remaining,
        limit: res.limit,
        resetAt: res.resetAt,
      });
      setLoaded(true);
    } catch {
      setError('Impossible de charger le Coach pour le moment.');
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: 'USER', content }]);
    try {
      const res = await api<{ userMessage: CoachMsg; assistantMessage: CoachMsg } & QuotaInfo>(
        '/api/coach/messages',
        { method: 'POST', body: { content } },
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        res.userMessage,
        res.assistantMessage,
      ]);
      setQuota({
        configured: true,
        remaining: res.remaining,
        limit: res.limit,
        resetAt: res.resetAt,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'COACH_DAILY_LIMIT_REACHED') {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setQuota((q) => ({ ...q, remaining: 0 }));
        setDraft(content);
      } else if (err instanceof ApiError && err.code === 'COACH_UNAVAILABLE') {
        const persisted = err.body.userMessage as CoachMsg | undefined;
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId && persisted ? persisted : m)),
        );
        setError(err.message);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setDraft(content);
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
      }
    } finally {
      setSending(false);
    }
  }

  const limitReached = quota.limit !== null && (quota.remaining ?? 0) <= 0;

  return (
    <>
      {/* Icon is pinned to white rather than `text-primary-foreground`: a few
          accent themes (dark-gold/dark-rose/dark-emerald) set that token to
          near-black for text-on-button contrast, which read as a literal
          black icon on the FAB. White stays legible against every theme's
          `--color-primary` (all medium-to-high saturation), so the bubble
          still reads as "the current theme's color" — just with a
          consistently white glyph instead of a token meant for text. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le Coach"
        className={`fixed bottom-36 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform active:scale-90 md:bottom-6 md:right-6 ${open ? 'hidden' : 'flex'}`}
      >
        <Icon name="bot" size={24} />
      </button>

      {open && (
        <div className="animate-fade-in-up fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col rounded-t-2xl border border-border bg-surface shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:h-[32rem] md:w-96 md:rounded-2xl md:animate-scale-in">
          <div className="flex items-center justify-between rounded-t-2xl bg-primary px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Icon name="bot" size={18} />
              </div>
              <div>
                <p className="font-headings text-sm font-semibold">Coach</p>
                <p className="font-body text-xs opacity-80">Ton coach personnel mariage</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le Coach"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20"
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
            {loading && (
              <p className="text-center font-body text-sm text-muted-foreground">Chargement…</p>
            )}

            {!loading && quota.configured === false && (
              <div className="rounded-xl border border-border bg-background p-4 text-center">
                <Icon name="info" size={20} className="mx-auto mb-2 text-muted-foreground" />
                <p className="font-body text-sm text-muted-foreground">
                  Le Coach IA n&rsquo;est pas encore configuré sur ce projet (clé API manquante).
                </p>
              </div>
            )}

            {!loading && quota.configured !== false && messages.length === 0 && (
              <p className="text-center font-body text-sm text-muted-foreground">
                Pose-moi une question sur ton profil ou ta recherche de partenaire sérieux(se).
              </p>
            )}

            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 font-body text-sm ${
                      m.role === 'USER'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground'
                    }`}
                  >
                    {m.content}
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
            {quota.configured !== false && (
              <p className="mb-2 text-center font-body text-xs text-muted-foreground">
                {quota.limit === null
                  ? 'Questions illimitées — Premium'
                  : `${Math.max(0, quota.remaining ?? 0)} question(s) restante(s) aujourd’hui`}
              </p>
            )}

            {quota.configured !== false && limitReached ? (
              <Link
                href="/app/premium"
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-headings text-sm font-semibold text-primary-foreground"
              >
                <Icon name="crown" size={16} />
                Passer Premium pour continuer
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send();
                  }}
                  disabled={sending || quota.configured === false}
                  placeholder="Écrivez votre message…"
                  className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 font-body text-sm text-foreground disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !draft.trim() || quota.configured === false}
                  aria-label="Envoyer"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                >
                  <Icon name="send" size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
