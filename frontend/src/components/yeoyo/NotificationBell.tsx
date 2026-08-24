'use client';

// In-app notification bell — surfaces the /api/notifications backend that
// already exists (contact-request-received, message-received rows are
// created server-side, see lib/server/notifications/templates.ts) but had
// no UI consumer anywhere in the app. Mounted once in AppShell so every
// authenticated screen gets it, mirroring how CoachWidget is mounted once
// rather than per-page.
//
// Bell icon deliberately stays an outline button (border + text-foreground)
// rather than a filled bg-primary circle — sidesteps the same
// black-icon-on-dark-accent-theme problem CoachWidget's FAB had (see that
// file's comment): no `--color-primary-foreground` dependency at all here.
// Only the small unread-count dot uses `bg-primary text-white`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function targetHref(item: NotificationItem): string | null {
  const data = (item.data ?? {}) as { conversationId?: string };
  if (item.type === 'MESSAGE_RECEIVED' && data.conversationId) {
    return `/app/messages/${data.conversationId}`;
  }
  if (item.type === 'CONTACT_REQUEST') return '/app/demandes';
  if (item.type === 'CONTACT_REQUEST_DECLINED') return '/app/decouvrir';
  return null;
}

export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(() => {
    api<{ count: number }>('/api/notifications/count')
      .then((res) => setUnreadCount(res.count))
      .catch(() => {
        /* badge is non-critical */
      });
  }, []);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function loadList() {
    setLoading(true);
    try {
      const res = await api<{ items: NotificationItem[] }>('/api/notifications?limit=10');
      setItems(res.items);
      setLoaded(true);
    } catch {
      /* dropdown just stays empty on failure */
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void loadList();
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    setUnreadCount(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await api('/api/notifications', { method: 'PATCH', body: { ids: 'all' } });
    } catch (err) {
      if (!(err instanceof ApiError)) return;
      loadCount();
    }
  }

  async function onItemClick(item: NotificationItem) {
    setOpen(false);
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      api('/api/notifications', { method: 'PATCH', body: { ids: [item.id] } }).catch(() => {
        /* best-effort — badge resyncs on next load */
      });
    }
    const href = targetHref(item);
    if (href) router.push(href);
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm transition-colors hover:border-primary/40"
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-body text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-scale-in absolute right-0 top-12 z-50 flex max-h-96 w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-headings text-sm font-semibold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="font-body text-xs font-medium text-primary"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <p className="px-4 py-6 text-center font-body text-sm text-muted-foreground">
                Chargement…
              </p>
            )}
            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Icon name="bell" size={22} className="text-muted-foreground" />
                <p className="font-body text-sm text-muted-foreground">
                  Aucune notification pour l&rsquo;instant.
                </p>
              </div>
            )}
            {!loading &&
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void onItemClick(item)}
                  className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-background ${
                    item.readAt ? '' : 'bg-secondary/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!item.readAt && (
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                    )}
                    <p className="truncate font-body text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                  </div>
                  <p className="line-clamp-2 font-body text-xs text-muted-foreground">
                    {item.body}
                  </p>
                  <p className="font-body text-[11px] text-muted-foreground">
                    {timeAgo(item.createdAt)}
                  </p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
