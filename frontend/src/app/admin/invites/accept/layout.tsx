// Deliberately minimal — NOT wrapped by the (dashboard) group's AdminLayout
// guard (the invitee has no session yet). Mirrors admin/login/layout.tsx.
import type { ReactNode } from 'react';

export default function AdminInviteAcceptLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">{children}</main>
  );
}
