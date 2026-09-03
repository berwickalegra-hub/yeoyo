// Shared raw-multipart upload helper for POST /api/upload.
//
// api.ts's `api()` wrapper is JSON-only, so file uploads use a bare `fetch`
// with a FormData body — which means they also miss api.ts's auto-refresh.
// This helper reproduces just that one piece: on a 401 it refreshes once and
// retries, so a stale access-token JWT doesn't surface as a generic "upload
// failed". Returns the created FileUpload id (feed it to the route that
// attaches the file, e.g. /api/profile/photos or /api/profile/verification).
//
// Extracted 2026-08-31 — onboarding/page.tsx and app/profil/page.tsx each
// carried their own copy; the verification screen needed a third.

import { COOKIE_PREFIX } from '@/lib/constants';
import { storeCsrfToken } from '@/lib/api';

function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const key = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function uploadFileWithAuthRetry(file: File): Promise<string> {
  async function attempt(): Promise<Response> {
    const form = new FormData();
    form.append('file', file);
    const csrfToken = readCsrfToken();
    return fetch('/api/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
  }

  let res = await attempt();
  if (res.status === 401) {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);
    if (refreshRes?.ok) {
      const refreshBody = (await refreshRes.json().catch(() => ({}))) as { csrfToken?: string };
      if (refreshBody.csrfToken) storeCsrfToken(refreshBody.csrfToken);
      res = await attempt();
    } else {
      throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "L'envoi de la photo a échoué. Réessaie.");
  }
  const uploaded = (await res.json()) as { id: string };
  return uploaded.id;
}
