// Calling `.close()` on an Ably connection that never authenticated (state
// 'failed' — e.g. ABLY_API_KEY unset locally, /api/realtime/token 503s)
// throws an unhandled promise rejection deep inside the SDK's connection
// state machine. A try/catch around `.close()` does NOT catch it, because
// the throw happens asynchronously outside our call stack — it just shows
// up as a red "Uncaught (in promise) Connection closed" in the console.
// Skipping close() when the connection is already terminal (failed/closed)
// avoids that codepath entirely; there are no internal timers left running
// to release in that state, so there's nothing close() would accomplish.
export function closeAblySafely(ably: { connection: { state: string }; close: () => void }): void {
  if (ably.connection.state === 'failed' || ably.connection.state === 'closed') return;
  try {
    ably.close();
  } catch {
    // ignore — realtime is a progressive enhancement, see callers
  }
}
