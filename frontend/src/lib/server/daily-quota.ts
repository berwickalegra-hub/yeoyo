// Shared UTC-calendar-day boundary helpers for free-tier daily quotas
// (Coach messages, conversation messages). Counting via a createdAt range
// query avoids a separate counter row that could drift out of sync.
import 'server-only';

export function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextUtcMidnight(): Date {
  return new Date(startOfUtcDay().getTime() + 24 * 60 * 60 * 1000);
}
