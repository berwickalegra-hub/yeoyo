// One-shot pre-launch cleanup (2026-08-31, explicit user ask): before real
// users arrive, take the 85 seeded illustration accounts (see
// seed-yeoyo-*.ts) OUT of every real user's view without deleting them —
// they stay in the DB so the seed set can still be filmed for promo
// material from a demo login.
//
//   1. Profile.demo = true for every seed account (email pattern match).
//      The discovery routes + profile-detail route now hide demo⇄real both
//      ways (see schema.prisma Profile.demo).
//   2. Wipe every interaction row that involves a seed account — Likes,
//      ContactRequests (this cascades to the linked Conversation and its
//      Messages), Favorites, ProfileViews, and the notifications those
//      produced — so the real test accounts start launch with empty
//      Demandes / Messages / Visiteurs.
//
// REQUIRES the 20260831000000_profile_demo_flag migration to be applied
// first (`pnpm --filter frontend exec prisma migrate deploy`).
//
// Usage (dry run — prints what it would do, changes nothing):
//   pnpm --filter frontend exec tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/park-demo-profiles.ts
// Usage (for real):
//   ... scripts/park-demo-profiles.ts --confirm
//
// Idempotent: re-running only re-marks (a no-op) and finds nothing left to
// delete. Deliberately has NO NODE_ENV=production guard — this is a
// production data task.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');

function isSeedEmail(email: string): boolean {
  return (
    email.startsWith('yeoyo-demo-') ||
    email.startsWith('yeoyo-women-') ||
    email.endsWith('@yeoyo.net') ||
    email.endsWith('@example.com')
  );
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const seedIds = users.filter((u) => isSeedEmail(u.email)).map((u) => u.id);
  const realIds = users.filter((u) => !isSeedEmail(u.email)).map((u) => u.id);

  console.log(`${users.length} users — ${seedIds.length} seed, ${realIds.length} real`);
  console.log(CONFIRM ? '\n>>> APPLYING CHANGES <<<\n' : '\n(dry run — pass --confirm to apply)\n');

  // 1. Mark the seed profiles.
  const alreadyMarked = await prisma.profile.count({
    where: { userId: { in: seedIds }, demo: true },
  });
  console.log(`demo flag: ${alreadyMarked}/${seedIds.length} seed profiles already marked`);
  if (CONFIRM) {
    const r = await prisma.profile.updateMany({
      where: { userId: { in: seedIds } },
      data: { demo: true },
    });
    console.log(`  → set demo=true on ${r.count} profiles`);
  }

  // 2. Interaction cleanup — count first, then (if confirmed) delete.
  const seedArg = (a: string, b: string) => ({
    where: { OR: [{ [a]: { in: seedIds } }, { [b]: { in: seedIds } }] },
  });

  const [likes, contactRequests, favorites, profileViews] = await Promise.all([
    prisma.like.count(seedArg('likerId', 'likedId') as never),
    prisma.contactRequest.count(seedArg('requesterId', 'targetId') as never),
    prisma.favorite.count(seedArg('userId', 'targetId') as never),
    prisma.profileView.count(seedArg('viewerId', 'viewedId') as never),
  ]);

  // Conversations/messages that will cascade-delete when their ContactRequest goes.
  const doomedContactRequests = await prisma.contactRequest.findMany({
    where: { OR: [{ requesterId: { in: seedIds } }, { targetId: { in: seedIds } }] },
    select: { id: true },
  });
  const doomedConversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: { in: seedIds } }, { userBId: { in: seedIds } }] },
    select: { id: true },
  });
  const doomedMessageRows = await prisma.message.findMany({
    where: { conversationId: { in: doomedConversations.map((c) => c.id) } },
    select: { id: true },
  });
  const doomedMessages = doomedMessageRows.length;

  // Every id that will no longer resolve after the deletes — used to find
  // real users' now-dangling notifications (their `data` references these
  // ids, never the seed user id — see notifications/templates.ts).
  const doomedIds = new Set<string>([
    ...doomedContactRequests.map((r) => r.id),
    ...doomedConversations.map((c) => c.id),
    ...doomedMessageRows.map((m) => m.id),
  ]);

  console.log('\ninteraction rows involving a seed account:');
  console.log(`  Like           ${likes}`);
  console.log(`  ContactRequest ${contactRequests}`);
  console.log(`  Conversation   ${doomedConversations.length}  (cascades from ContactRequest)`);
  console.log(`  Message        ${doomedMessages}  (cascades from Conversation)`);
  console.log(`  Favorite       ${favorites}`);
  console.log(`  ProfileView    ${profileViews}`);

  if (CONFIRM) {
    // ContactRequest first: Conversation.contactRequestId is onDelete:Cascade,
    // and Message.conversationId is onDelete:Cascade, so this one delete
    // takes the whole thread with it.
    const cr = await prisma.contactRequest.deleteMany(seedArg('requesterId', 'targetId') as never);
    // A seed account could still be in a Conversation whose ContactRequest
    // somehow already vanished — mop those up explicitly.
    const cv = await prisma.conversation.deleteMany({
      where: { OR: [{ userAId: { in: seedIds } }, { userBId: { in: seedIds } }] },
    });
    const lk = await prisma.like.deleteMany(seedArg('likerId', 'likedId') as never);
    const fv = await prisma.favorite.deleteMany(seedArg('userId', 'targetId') as never);
    const pv = await prisma.profileView.deleteMany(seedArg('viewerId', 'viewedId') as never);
    console.log(
      `  → deleted ${cr.count} ContactRequest, ${cv.count} stray Conversation, ` +
        `${lk.count} Like, ${fv.count} Favorite, ${pv.count} ProfileView`,
    );
  }

  // 3. Notifications: a seed account's own, plus any real user's notification
  //    that points at a request / conversation / message we're about to
  //    delete (its `data` carries that id — see notifications/templates.ts).
  const realNotifs = await prisma.notification.findMany({
    where: { userId: { in: realIds } },
    select: { id: true, data: true },
  });
  const staleRealNotifIds = realNotifs
    .filter((n) => {
      if (!n.data) return false;
      const blob = JSON.stringify(n.data);
      return [...doomedIds].some((id) => blob.includes(id));
    })
    .map((n) => n.id);
  const ownSeedNotifs = await prisma.notification.count({ where: { userId: { in: seedIds } } });

  console.log('\nnotifications:');
  console.log(`  seed accounts' own            ${ownSeedNotifs}`);
  console.log(`  real users', referencing seed ${staleRealNotifIds.length}`);

  if (CONFIRM) {
    const n1 = await prisma.notification.deleteMany({ where: { userId: { in: seedIds } } });
    const n2 = await prisma.notification.deleteMany({ where: { id: { in: staleRealNotifIds } } });
    console.log(`  → deleted ${n1.count + n2.count} notifications`);
  }

  console.log(CONFIRM ? '\nDone.' : '\nDry run complete — nothing changed.');
}

main()
  .catch((e) => {
    console.error('FATAL', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
