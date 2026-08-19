'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { usePwaInstall } from '@/lib/yeoyo/usePwaInstall';

// Explorer's swipe card is built around a hard "never needs a scroll to see
// the action buttons" requirement (2026-08-19, repeated explicit user
// ask) — this banner sits above AppShell entirely and would eat into that
// budget on exactly the screen a first-time user is most likely to land on
// with it still undismissed. Suppressed there specifically; every other
// screen keeps it.
const SUPPRESSED_PATHS = ['/app/explorer'];

const DISMISS_KEY = 'yeoyo-pwa-install-dismissed';

// Global install banner — pinned to the TOP of the viewport (not a bottom
// card) per a reference dating app screenshot showing a slim colored bar
// ("L'app Farata est là 🚀 ... [Télécharger]") sitting above the header on
// every screen. Dismissible once (persisted) — a permanent, always-
// reachable fallback for changing your mind later lives in Paramètres →
// À propos, wired to the same usePwaInstall() hook so both trigger the
// identical native prompt.
export function InstallPwaPrompt() {
  const pathname = usePathname();
  const { canInstall, install, iosHint, inAppBrowser, installed } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) !== '1') setDismissed(false);
  }, []);

  useEffect(() => {
    if (installed) {
      setDismissed(true);
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
  }, [installed]);

  function dismiss() {
    setDismissed(true);
    window.localStorage.setItem(DISMISS_KEY, '1');
  }

  async function handleInstall() {
    await install();
    dismiss();
  }

  if (installed || dismissed || (!canInstall && !iosHint)) return null;
  if (SUPPRESSED_PATHS.includes(pathname)) return null;

  return (
    <div className="animate-fade-in-down relative z-50 flex items-center gap-3 bg-primary px-4 py-2.5 text-white shadow-md">
      <Icon name="zap" size={18} className="flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-headings text-xs font-bold sm:text-sm">
          L&rsquo;app YeOyo est là
        </p>
        <p className="truncate font-body text-[11px] opacity-90 sm:text-xs">
          {canInstall
            ? 'Plus rapide, notifications incluses'
            : inAppBrowser
              ? 'Ouvre ce lien dans Safari pour installer l’app'
              : 'Appuyez sur Partager, puis « Sur l’écran d’accueil »'}
        </p>
      </div>
      {canInstall && (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="flex-shrink-0 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 font-body text-xs font-semibold text-primary transition-opacity hover:opacity-90"
        >
          Télécharger
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer"
        className="flex-shrink-0 text-white/80 hover:text-white"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
