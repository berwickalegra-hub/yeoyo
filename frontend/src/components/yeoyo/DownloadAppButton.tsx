'use client';

// Hero secondary CTA ("Télécharger l'app") for the "Rencontres Sérieuses
// Congo" landing redesign (2026-08-13). No app-store asset exists — this
// project ships a real installable PWA instead (see InstallPwaPrompt.tsx /
// usePwaInstall.ts), so the button triggers the same native install flow
// rather than linking to a fabricated store page.
//
// iOS has no `beforeinstallprompt` API at all — there is no way for any
// website to add itself to the home screen programmatically there, on any
// browser. The only real fix is a manual Share → "Sur l'écran d'accueil"
// step, which is what this shows. Previously that instruction was a 3s
// toast (2026-08-14, explicit user report: "clicking the button on my
// iPhone does nothing") — by the time someone found the Share icon in
// Safari's toolbar the message had already vanished, which reads exactly
// like "nothing happened." Now a persistent modal that stays open until
// dismissed. Also now distinguishes an in-app browser (WhatsApp/Instagram/…)
// from plain iOS Safari — Add to Home Screen isn't offered inside those
// webviews at all, so the fix there is "open this link in Safari," not
// "tap Share" (there may be no working Share sheet to tap).
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { usePwaInstall } from '@/lib/yeoyo/usePwaInstall';
import { useToast } from '@/contexts/ToastContext';

function IosInstallModal({
  inAppBrowser,
  onClose,
}: {
  inAppBrowser: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Installer YeOyo"
      onClick={onClose}
      className="animate-fade-in-up fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl bg-surface p-6 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-headings text-lg font-bold text-foreground">Installer YeOyo</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {inAppBrowser ? (
          <p className="font-body text-sm leading-relaxed text-foreground">
            Ce lien est ouvert dans une application (WhatsApp, Instagram…), qui ne permet pas
            d&rsquo;installer l&rsquo;app. Appuie sur{' '}
            <span className="font-semibold">⋯ ou Ouvrir dans le navigateur</span>, puis ouvre ce
            lien dans <span className="font-semibold">Safari</span> pour continuer.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent">
                <span className="font-body text-sm font-bold text-accent-foreground">1</span>
              </div>
              <p className="font-body text-sm text-foreground">
                Appuie sur <Icon name="share" size={15} className="mx-1 inline text-primary" />{' '}
                <span className="font-semibold">Partager</span> dans la barre de Safari
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent">
                <span className="font-body text-sm font-bold text-accent-foreground">2</span>
              </div>
              <p className="font-body text-sm text-foreground">
                Choisis <span className="font-semibold">Sur l&rsquo;écran d&rsquo;accueil</span>
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-primary py-3 font-body text-sm font-semibold text-primary-foreground"
        >
          Compris
        </button>
      </div>
    </div>
  );
}

export function DownloadAppButton() {
  const { canInstall, install, iosHint, inAppBrowser, installed } = usePwaInstall();
  const { toast } = useToast();
  const [showIosModal, setShowIosModal] = useState(false);

  function handleClick() {
    if (canInstall) {
      void install();
      return;
    }
    if (iosHint) {
      setShowIosModal(true);
      return;
    }
    if (installed) {
      toast('YeOyo est déjà installée sur cet appareil !', 'success');
      return;
    }
    document.getElementById('comment-ca-marche')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center justify-center gap-2 rounded-xl border border-border py-3.5 text-center font-body text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary lg:px-5 lg:py-3.5 lg:text-base"
      >
        <Icon name="smartphone" size={18} />
        Télécharger l&rsquo;app
      </button>
      {showIosModal && (
        <IosInstallModal inAppBrowser={inAppBrowser} onClose={() => setShowIosModal(false)} />
      )}
    </>
  );
}
