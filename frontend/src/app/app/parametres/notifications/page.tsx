'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { Toggle } from '@/components/ui/Toggle';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { usePushNotifications } from '@/lib/yeoyo/usePushNotifications';
import type { NotificationPrefs } from '@/lib/server/notifications/prefs-merge';

const NOTIF_EVENTS: { key: string; label: string; helper: string }[] = [
  {
    key: 'CONTACT_REQUEST',
    label: 'Demandes de contact',
    helper: 'Quand quelqu’un souhaite entrer en contact',
  },
  {
    key: 'MESSAGE_RECEIVED',
    label: 'Messages reçus',
    helper: 'Nouveaux messages dans tes conversations',
  },
  { key: 'LIKE_RECEIVED', label: 'Likes reçus', helper: 'Quand quelqu’un aime ton profil' },
  {
    key: 'PROFILE_RECOMMENDED',
    label: 'Profils recommandés',
    helper: 'Suggestions de profils compatibles',
  },
];

export default function NotificationsSettingsPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const { state: pushState, enable: enablePush, disable: disablePush } = usePushNotifications();
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ prefs: NotificationPrefs }>('/api/notifications/prefs');
      setNotifPrefs(res.prefs);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function toggleNotif(eventKey: string, value: boolean) {
    const previous = notifPrefs;
    setNotifPrefs({ ...notifPrefs, [eventKey]: { email: value, inApp: value } });
    try {
      await api('/api/notifications/prefs', {
        method: 'PATCH',
        body: { prefs: { [eventKey]: { email: value, inApp: value } } },
      });
    } catch (err) {
      setNotifPrefs(previous);
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="parametres"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <SettingsSubHeader title="Notifications" subtitle="Ce que tu veux être averti(e)" />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="Notifications push (cet appareil)">
          <SettingsRow
            label="Recevoir les notifications sur cet appareil"
            helper={
              pushState === 'denied'
                ? 'Tu as bloqué les notifications — réactive-les dans les réglages de ton navigateur.'
                : pushState === 'ios-needs-install'
                  ? "Installe d'abord YeOyo sur ton écran d'accueil."
                  : pushState === 'unconfigured' || pushState === 'unsupported'
                    ? 'Non disponible sur ce navigateur.'
                    : 'Message, match accepté, nouvelle demande de contact.'
            }
          >
            <Toggle
              label="Notifications push"
              checked={pushState === 'granted'}
              disabled={pushState !== 'granted' && pushState !== 'default'}
              onChange={(v) => void (v ? enablePush() : disablePush())}
            />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Notifications">
          {NOTIF_EVENTS.map((e) => (
            <SettingsRow key={e.key} label={e.label} helper={e.helper}>
              <Toggle
                label={e.label}
                checked={notifPrefs[e.key]?.inApp !== false}
                onChange={(v) => toggleNotif(e.key, v)}
              />
            </SettingsRow>
          ))}
        </SettingsSection>
      </div>
    </AppShell>
  );
}
