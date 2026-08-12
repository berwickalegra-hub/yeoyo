import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Runs before paint (blocking, no `defer`/`async`) so a stored theme
// preference from Paramètres → Apparence applies immediately instead of
// flashing the default dark-gold theme for a frame — ThemeProvider's own
// effect only syncs React state to match, it doesn't re-apply this.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem('yeoyo-theme');
    if (t && t !== 'dark-gold') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
`;

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'YeOyo',
  description: 'La rencontre sérieuse, faite pour les Congolais.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={dmSans.className}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
