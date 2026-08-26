// Deliberately minimal — NOT wrapped by the (dashboard) group's gated
// layout (which would redirect here in a loop). No sidebar, no
// /api/affiliate/me probe.
import type { ReactNode } from 'react';

export default function AffiliateLoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">{children}</main>
  );
}
