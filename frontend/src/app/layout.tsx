import type { Metadata, Viewport } from 'next';
import { DM_Sans, PT_Serif } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { CreditsProvider } from '@/contexts/CreditsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { InstallPwaPrompt } from '@/components/yeoyo/InstallPwaPrompt';

// Runs before paint (blocking, no `defer`/`async`) so a stored theme
// preference from Paramètres → Apparence applies immediately instead of
// flashing the default terracotta theme for a frame — ThemeProvider's own
// effect only syncs React state to match, it doesn't re-apply this.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem('yeoyo-theme');
    if (t && t !== 'terracotta') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
`;

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

// Headings font for the terracotta/cream default theme (Banani "Rencontres
// Sérieuses Congo" flow, 2026-08-13) — fonts aren't per-theme (a single
// pairing applies across every color template, unchanged pattern since the
// 2026-07-30 DM Sans swap), so this becomes the app-wide headings font.
const ptSerif = PT_Serif({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'YeOyo',
  description: 'La rencontre sérieuse, faite pour l’Afrique francophone.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'YeOyo',
  },
};

export const viewport: Viewport = {
  themeColor: '#c17a4e',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${ptSerif.variable}`}>
      <head>
        {/* Next 16's `metadata.appleWebApp.capable` only emits the newer,
            unprefixed `mobile-web-app-capable` tag (verified via the
            rendered HTML) — iOS versions before 17.4 only recognize this
            Apple-prefixed one, so without it "Add to Home Screen" still
            works but launches inside Safari's chrome instead of standalone
            on older iPhones. Added manually since the Metadata API doesn't
            emit it here. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={dmSans.className}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <CreditsProvider>
                {/* `dvh` (not `vh`) so mobile Safari's collapsing address/
                    toolbar chrome is accounted for from the very first
                    paint — `100vh` there is the LARGER "toolbar collapsed"
                    height, taller than what's actually visible before the
                    user scrolls once, which is exactly what pushed
                    Explorer's action buttons out of view (2026-08-19,
                    explicit user report with screenshots). `flex flex-col`
                    here + `flex-1` on AppShell's own root (no min-height of
                    its own) means AppShell correctly shrinks to whatever
                    space remains under this banner instead of stacking its
                    own full viewport height on top of it. */}
                <div className="flex min-h-dvh flex-col">
                  <InstallPwaPrompt />
                  {children}
                </div>
              </CreditsProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
