// Deliberately minimal — NOT wrapped by the (dashboard) group's
// AdminLayout guard (which would redirect here in a loop). No sidebar,
// no /api/admin/me probe.
import type { ReactNode } from 'react';

export default function AdminLoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">{children}</main>
  );
}
