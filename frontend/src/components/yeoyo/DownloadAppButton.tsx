'use client';

// Hero secondary CTA ("Télécharger l'app") for the "Rencontres Sérieuses
// Congo" landing redesign (2026-08-13). No app-store asset exists — this
// project ships a real installable PWA instead (see InstallPwaPrompt.tsx /
// usePwaInstall.ts), so the button triggers the same native install flow
// rather than linking to a fabricated store page. Falls back to a toast
// with manual steps on iOS Safari, and to a scroll-to-features anchor if
// the app is already installed or the platform offers neither path — same
// "don't fabricate, degrade honestly" precedent as the prior landing
// redesign's demo-CTA relabel.
import { Icon } from '@/components/ui/Icon';
import { usePwaInstall } from '@/lib/yeoyo/usePwaInstall';
import { useToast } from '@/contexts/ToastContext';

export function DownloadAppButton() {
  const { canInstall, install, iosHint, installed } = usePwaInstall();
  const { toast } = useToast();

  function handleClick() {
    if (canInstall) {
      void install();
      return;
    }
    if (iosHint) {
      toast('Appuyez sur Partager, puis « Sur l’écran d’accueil »', 'success');
      return;
    }
    if (installed) {
      toast('YeOyo est déjà installée sur cet appareil !', 'success');
      return;
    }
    document.getElementById('comment-ca-marche')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-border py-3.5 text-center font-body text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary lg:px-5 lg:py-3.5 lg:text-base"
    >
      <Icon name="smartphone" size={18} />
      Télécharger l&rsquo;app
    </button>
  );
}
