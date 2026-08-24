// Calling `.close()` on an Ably connection that never reached 'connected'
// (e.g. ABLY_API_KEY unset locally, /api/realtime/token 503s — the auth
// callback then keeps retrying, so the connection can sit in 'connecting',
// 'disconnected', or 'suspended', not just 'failed') throws an unhandled
// promise rejection deep inside the SDK's connection state machine: close()
// rejects an internal pending auth/connect promise that nothing in this
// codebase holds a reference to, so no try/catch here can intercept it —
// it surfaces as a red "Uncaught (in promise) Connection closed" (2026-08-22,
// found live: skipping only 'failed'/'closed' wasn't enough, the crash also
// hit while still mid-retry in 'connecting'/'disconnected').
// Only a genuinely 'connected' session has a live connection worth closing
// gracefully — every other state is safe to just abandon.
export function closeAblySafely(ably: { connection: { state: string }; close: () => void }): void {
  if (ably.connection.state !== 'connected') return;
  try {
    ably.close();
  } catch {
    // ignore — realtime is a progressive enhancement, see callers
  }
}

// Follow-up (2026-08-22, same day, caught live on Sentry): the guard above
// isn't sufficient either. That Sentry event's stack traced all the way
// through `_ConnectionManager.closeImpl` / `requestState` / `notifyState` —
// i.e. `.close()` genuinely ran on a `state === 'connected'` session, and
// Ably's own ConnectionManager still rejected an internal promise nothing
// in this codebase ever gets a handle on. This isn't reachable from a
// try/catch around our call site at all — it's the SDK's own internal
// close/reconnect bookkeeping racing itself. Narrowly suppress just that
// one known, harmless, SDK-internal rejection globally so it stops
// reaching Sentry as an "Unhandled"/crash-looking error; every other
// unhandled rejection still surfaces normally.
export function installAblyRejectionGuard(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __ablyRejectionGuardInstalled?: boolean };
  if (w.__ablyRejectionGuardInstalled) return;
  w.__ablyRejectionGuardInstalled = true;
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: unknown } | undefined;
    if (reason?.message === 'Connection closed') event.preventDefault();
  });
}
