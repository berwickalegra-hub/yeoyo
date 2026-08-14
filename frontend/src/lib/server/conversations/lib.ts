// Shared helpers for the messaging routes. A Conversation's userAId/userBId
// pair is stored in canonical sorted-id order (not requester/target order)
// so `@@unique([userAId, userBId])` holds regardless of who accepted the
// ContactRequest, and a lookup for "the conversation between me and X" never
// needs an OR clause.
export function orderedPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export function otherParticipant(
  conversation: { userAId: string; userBId: string },
  selfId: string,
): string {
  return conversation.userAId === selfId ? conversation.userBId : conversation.userAId;
}

export function isParticipant(
  conversation: { userAId: string; userBId: string },
  userId: string,
): boolean {
  return conversation.userAId === userId || conversation.userBId === userId;
}

// Which of the two flat `mutedByUserA`/`mutedByUserB` booleans belongs to
// `userId` — same 1:1-only pattern as the rest of this file, no join table.
export function mutedFieldFor(
  conversation: { userAId: string; userBId: string },
  userId: string,
): 'mutedByUserA' | 'mutedByUserB' {
  return conversation.userAId === userId ? 'mutedByUserA' : 'mutedByUserB';
}

export function isMutedBy(
  conversation: { userAId: string; userBId: string; mutedByUserA: boolean; mutedByUserB: boolean },
  userId: string,
): boolean {
  return conversation[mutedFieldFor(conversation, userId)];
}
