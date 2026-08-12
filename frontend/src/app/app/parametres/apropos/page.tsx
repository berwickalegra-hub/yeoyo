'use client';

import { useUser } from '@/contexts/AuthContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection } from '@/components/yeoyo/SettingsSection';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

export default function AProposPage() {
  const user = useUser();
  const badgeCounts = useNavCounts();

  if (!user) return null;

  return (
    <AppShell active="parametres" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <SettingsSubHeader title="À propos" />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="YeOyo">
          <p className="font-body text-sm text-muted-foreground">
            La rencontre sérieuse, faite pour les Congolais.
          </p>
          <a href="mailto:contact@yeoyo.app" className="font-body text-sm text-primary underline">
            Nous contacter
          </a>
        </SettingsSection>
      </div>
    </AppShell>
  );
}
