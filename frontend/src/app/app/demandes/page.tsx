// Demandes — contact-request inbox, rebuilt against a Banani re-fetch
// (2026-08-07, screen "YeOyo — Demandes (Desktop)"). The original Phase D
// build only had 2 tabs (Reçues/Envoyées); the real mockup has 3
// (+ "Contacts" — everyone with an ACCEPTED request either direction) plus
// a right-hand "Comment ça marche" explainer panel. Accepting a request
// creates a Conversation server-side (POST /api/contact-requests/[id]/respond)
// and routes straight to the new thread — unchanged from before.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { ContactRequestCard } from '@/components/yeoyo/ContactRequestCard';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import type { ProfileCard } from '@/lib/yeoyo/types';

interface RequestRow {
  id: string;
  status: string;
  createdAt: string;
  conversationId: string | null;
  otherUser: ProfileCard;
}

type Tab = 'received' | 'sent' | 'contacts';

const HOW_IT_WORKS = [
  {
    icon: 'heart' as const,
    title: 'Tu likes un profil',
    desc: 'Une demande de contact est envoyée automatiquement.',
  },
  {
    icon: 'bell' as const,
    title: 'Elle / Il voit ta demande',
    desc: 'La personne reçoit une notification et peut voir ton profil.',
  },
  {
    icon: 'check-circle' as const,
    title: 'Demande acceptée',
    desc: "Si c'est mutuel, vous devenez contacts et pouvez discuter.",
  },
];

export default function DemandesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [tab, setTab] = useState<Tab>('received');
  const [received, setReceived] = useState<RequestRow[]>([]);
  const [sent, setSent] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [receivedRes, sentRes] = await Promise.all([
        api<{ requests: RequestRow[] }>('/api/contact-requests?type=received'),
        api<{ requests: RequestRow[] }>('/api/contact-requests?type=sent'),
      ]);
      setReceived(receivedRes.requests);
      setSent(sentRes.requests);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const contacts = useMemo(() => {
    const merged = [...received, ...sent].filter((r) => r.status === 'ACCEPTED');
    const seen = new Set<string>();
    return merged.filter((r) => {
      if (seen.has(r.otherUser.userId)) return false;
      seen.add(r.otherUser.userId);
      return true;
    });
  }, [received, sent]);

  async function respond(id: string, action: 'ACCEPT' | 'DECLINE') {
    setRespondingId(id);
    try {
      const res = await api<{ status: string; conversationId: string | null }>(
        `/api/contact-requests/${id}/respond`,
        { method: 'POST', body: { action } },
      );
      if (action === 'ACCEPT' && res.conversationId) {
        toast('Demande acceptée — conversation ouverte', 'success');
        router.push(`/app/messages/${res.conversationId}`);
        return;
      }
      toast('Demande refusée', 'success');
      setReceived((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setRespondingId(null);
    }
  }

  if (!user) return null;

  const activeRows = tab === 'received' ? received : tab === 'sent' ? sent : contacts;
  const TAB_LABELS: Record<Tab, string> = {
    received: 'Reçues',
    sent: 'Envoyées',
    contacts: 'Contacts',
  };
  const TAB_COUNTS: Record<Tab, number> = {
    received: received.filter((r) => r.status === 'PENDING').length,
    sent: sent.length,
    contacts: contacts.length,
  };

  return (
    <AppShell active="demandes" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex-1">
          <div className="border-b border-border px-5 py-5 lg:px-8">
            <h1 className="font-headings text-xl font-bold text-foreground">Demandes</h1>
            <p className="mt-0.5 font-body text-sm text-muted-foreground">
              Gérez vos demandes de contact
            </p>
          </div>

          <div className="flex gap-1 border-b border-border px-5 lg:px-8">
            {(['received', 'sent', 'contacts'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 font-body text-sm font-medium sm:px-6 ${
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground'
                }`}
              >
                {TAB_LABELS[t]}
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-body text-xs font-bold ${
                    tab === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {TAB_COUNTS[t]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 px-5 py-6 lg:px-8">
            {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

            {!loading && activeRows.length === 0 && tab !== 'contacts' && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Icon name="inbox" size={24} className="text-muted-foreground" />
                </div>
                <p className="font-headings text-base font-semibold text-foreground">
                  {tab === 'received' ? 'Aucune demande reçue' : "Tu n'as envoyé aucune demande"}
                </p>
                <p className="max-w-xs font-body text-sm text-muted-foreground">
                  {tab === 'received'
                    ? "Quand quelqu'un envoie une demande de contact, elle apparaîtra ici."
                    : 'Like un profil pour envoyer ta première demande.'}
                </p>
                {tab === 'received' && (
                  <Link
                    href="/app/explorer"
                    className="mt-3 rounded-lg bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground"
                  >
                    Explorer des profils
                  </Link>
                )}
              </div>
            )}

            {!loading && activeRows.length === 0 && tab === 'contacts' && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Icon name="users" size={24} className="text-muted-foreground" />
                </div>
                <p className="font-headings text-base font-semibold text-foreground">
                  Aucun contact pour l&rsquo;instant
                </p>
                <p className="max-w-xs font-body text-sm text-muted-foreground">
                  Dès qu&rsquo;une demande est acceptée, le contact apparaît ici.
                </p>
              </div>
            )}

            {!loading &&
              activeRows.map((r) => (
                <ContactRequestCard
                  key={r.id}
                  otherUser={r.otherUser}
                  status={r.status}
                  direction={tab === 'sent' ? 'sent' : 'received'}
                  conversationId={r.conversationId}
                  responding={respondingId === r.id}
                  onAccept={() => respond(r.id, 'ACCEPT')}
                  onDecline={() => respond(r.id, 'DECLINE')}
                />
              ))}
          </div>
        </div>

        <div className="w-full flex-shrink-0 border-t border-border bg-surface lg:w-72 lg:border-l lg:border-t-0">
          <div className="border-b border-border px-5 py-5">
            <h2 className="font-headings text-sm font-semibold text-foreground">
              Comment ça marche
            </h2>
          </div>
          <div className="flex flex-col gap-5 p-5">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.title} className="flex gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary">
                  <Icon name={step.icon} size={16} />
                </div>
                <div>
                  <p className="font-headings text-sm font-semibold text-foreground">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 font-body text-xs leading-relaxed text-muted-foreground">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}

            <div className="mt-2 border-t border-border pt-5">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="mb-1 font-headings text-sm font-semibold text-foreground">
                  Débloquer plus de demandes
                </p>
                <p className="mb-3 font-body text-xs text-muted-foreground">
                  Avec le plan Premium, envoie jusqu&rsquo;à 20 demandes par semaine.
                </p>
                <a
                  href="/app/premium"
                  className="block w-full rounded-lg bg-primary py-2.5 text-center font-body text-xs font-semibold text-primary-foreground"
                >
                  Passer Premium — Mobile Money
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
