'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { resetTour } from '@/lib/yeoyo/guided-tour';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection } from '@/components/yeoyo/SettingsSection';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { usePwaInstall } from '@/lib/yeoyo/usePwaInstall';

export default function AProposPage() {
  const user = useUser();
  const router = useRouter();
  const badgeCounts = useNavCounts();
  const { canInstall, install, iosHint, inAppBrowser, installed } = usePwaInstall();

  if (!user) return null;

  return (
    <AppShell
      active="parametres"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <SettingsSubHeader title="À propos" />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="YeOyo">
          <p className="font-body text-sm text-muted-foreground">
            La rencontre sérieuse, faite pour l&rsquo;Afrique francophone.
          </p>
          <a href="mailto:contact@yeoyo.app" className="font-body text-sm text-primary underline">
            Nous contacter
          </a>
        </SettingsSection>

        {!installed && (
          <SettingsSection title="Application mobile">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Icon name="smartphone" size={18} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm text-foreground">
                  {canInstall
                    ? 'Installe YeOyo sur ton téléphone'
                    : inAppBrowser
                      ? 'Ouvre ce lien dans Safari pour installer l’app'
                      : iosHint
                        ? 'Appuie sur Partager, puis « Sur l’écran d’accueil »'
                        : 'Bientôt disponible sur ce navigateur'}
                </p>
              </div>
              {canInstall && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="flex-shrink-0 rounded-full bg-primary px-4 py-2 font-body text-xs font-semibold text-primary-foreground"
                >
                  Installer
                </button>
              )}
            </div>
          </SettingsSection>
        )}

        <SettingsSection title="Aide">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Icon name="info" size={18} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm text-foreground">Revoir la visite guidée</p>
              <p className="font-body text-xs text-muted-foreground">
                Le petit tour qui présente chaque bouton de l&rsquo;app.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetTour();
                router.push('/app/decouvrir');
              }}
              className="flex-shrink-0 rounded-full bg-primary px-4 py-2 font-body text-xs font-semibold text-primary-foreground"
            >
              Relancer
            </button>
          </div>
        </SettingsSection>

        <SettingsSection title="Légal">
          <div className="flex flex-col gap-3">
            <Link
              href="/reglement"
              target="_blank"
              className="flex items-center justify-between font-body text-sm text-foreground"
            >
              Règlement de la communauté
              <Icon name="chevron-right" size={16} className="text-muted-foreground" />
            </Link>
            <Link
              href="/conditions-utilisation"
              target="_blank"
              className="flex items-center justify-between font-body text-sm text-foreground"
            >
              Conditions d&rsquo;utilisation
              <Icon name="chevron-right" size={16} className="text-muted-foreground" />
            </Link>
            <Link
              href="/confidentialite"
              target="_blank"
              className="flex items-center justify-between font-body text-sm text-foreground"
            >
              Politique de confidentialité
              <Icon name="chevron-right" size={16} className="text-muted-foreground" />
            </Link>
          </div>
        </SettingsSection>
      </div>
    </AppShell>
  );
}
