import 'server-only';

// Profile moderation hold — see Profile.moderationHeldAt in schema.prisma.
//
// A held profile is soft-hidden: still logs in, still edits itself, keeps
// open conversations + the Équipe YeOyo thread, but is invisible in
// discovery (both directions) and can't start new contact. This is the
// lighter counterpart to User.status = SUSPENDED (which blocks auth).

export interface HeldState {
  moderationHeldAt: Date | null;
  moderationReason: string | null;
}

export function isHeld(p: HeldState | null | undefined): boolean {
  return !!p?.moderationHeldAt;
}

/** The Équipe YeOyo message auto-sent to the user when an admin holds their
 *  profile. `reason` is the admin's own words. */
export function holdNoticeMessage(reason: string): string {
  return [
    'Bonjour,',
    '',
    `Ton profil a été mis en retrait par notre équipe pour la raison suivante :`,
    `« ${reason.trim()} »`,
    '',
    "Pendant ce temps, ton profil n'apparaît plus dans Découvrir et tu ne peux pas envoyer de nouvelles demandes. Tes conversations en cours restent ouvertes.",
    '',
    'Pour rétablir ton profil : va dans « Mon profil », corrige le point ci-dessus (par exemple change la photo concernée), puis réponds à ce message pour nous prévenir. Nous réexaminons et réactivons ton profil.',
    '',
    "L'équipe YeOyo",
  ].join('\n');
}

/** The Équipe YeOyo message auto-sent when an admin releases the hold. */
export function releaseNoticeMessage(): string {
  return [
    'Bonne nouvelle 🎉',
    '',
    'Ton profil a été réexaminé et il est de nouveau visible. Tu réapparais dans Découvrir et tu peux à nouveau envoyer des demandes.',
    '',
    'Merci pour ta coopération.',
    "L'équipe YeOyo",
  ].join('\n');
}
