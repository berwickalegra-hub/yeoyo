'use client';

import { useUser } from '@/contexts/AuthContext';
import { useTheme, THEMES } from '@/contexts/ThemeContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { Icon } from '@/components/ui/Icon';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

export default function ApparencePage() {
  const user = useUser();
  const badgeCounts = useNavCounts();
  const { theme, setTheme } = useTheme();

  if (!user) return null;

  return (
    <AppShell
      active="parametres"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <SettingsSubHeader
        title="Apparence"
        subtitle="Choisis le thème de couleurs de l'application — appliqué immédiatement."
      />
      <div className="grid grid-cols-1 gap-3 px-5 py-6 sm:grid-cols-2 lg:mx-auto lg:max-w-3xl lg:px-8">
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={active}
              className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
                active ? 'border-primary bg-secondary/20' : 'border-border bg-surface'
              }`}
            >
              <div
                className="flex h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-border"
                style={{ backgroundColor: t.swatch.background }}
              >
                <div className="h-full w-1/2" style={{ backgroundColor: t.swatch.surface }} />
                <div className="h-full w-1/2" style={{ backgroundColor: t.swatch.primary }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-headings text-sm font-semibold text-foreground">{t.label}</p>
                <p className="mt-0.5 font-body text-xs text-muted-foreground">{t.description}</p>
              </div>
              <div
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? 'border-primary bg-primary' : 'border-border'
                }`}
              >
                {active && <Icon name="check" size={13} className="text-primary-foreground" />}
              </div>
            </button>
          );
        })}
      </div>
    </AppShell>
  );
}
