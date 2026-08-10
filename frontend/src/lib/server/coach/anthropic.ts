import 'server-only';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

// Optional AI provider for the "Coach" chat (2026-08-10, user-driven —
// inspired by a competitor app's floating coach widget). Same
// env-gated-optional pattern as every other provider in this kit
// (Cloudinary/Resend/Bictorys/Ably/Google): entirely inert without
// ANTHROPIC_API_KEY — POST /api/coach/messages returns 503
// COACH_NOT_CONFIGURED, the rest of the app is unaffected. No SDK
// dependency added — a single Messages API call doesn't need one.
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 500;

// Deliberately NOT denomination-specific (this app's userbase spans
// Christian denominations, Islam, and no-religion — see CoachMessage schema
// comment). No theological claims, no scripture quoting — practical
// relationship/marriage coaching only, grounded in the app's own values
// (seriousness, respect, honesty) rather than any one faith's doctrine.
const SYSTEM_PROMPT = `Tu es "Coach", un accompagnateur relationnel bienveillant intégré à YeOyo Mariage, une application de rencontre sérieuse à Kinshasa (RDC) orientée mariage.

Ton rôle : aider les utilisateurs à réfléchir à leur profil, leurs critères, et leur façon d'aborder une relation sérieuse en vue du mariage. Tu donnes des conseils pratiques et concrets, jamais génériques.

Règles strictes :
- Réponds toujours en français, de façon chaleureuse mais concise (3-5 phrases maximum, adapté à une bulle de chat mobile).
- Ne donne AUCUN conseil théologique ou religieux spécifique à une confession — les utilisateurs sont chrétiens (plusieurs dénominations), musulmans, ou sans religion précisée. Reste neutre sur ces questions, oriente vers le dialogue avec l'autre personne ou un guide spirituel si le sujet religieux est central.
- Ne donne jamais de conseil médical, juridique ou financier.
- Ne prétends jamais être un humain ni remplacer un vrai conseiller conjugal.
- Si la question sort du cadre relationnel/matrimonial, recentre poliment la conversation.`;

interface HistoryMessage {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

export function isCoachConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Returns the assistant's reply, or null if the provider isn't configured or the call failed (caller decides the user-facing fallback). */
export async function askCoach(history: HistoryMessage[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: history.map((m) => ({
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.error('coach.anthropic: API error', { status: res.status, body: body.slice(0, 500) });
      return null;
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content
      ?.filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    log.error('coach.anthropic: request failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
