# Animations dynamiques + corrections d'état — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every like/message/accept-decline button in the YeOyo frontend give real, persistent visual feedback (filled heart with a bounce, button color-flip, per-card spinner) and fix the state bugs that currently prevent that feedback from being trustworthy.

**Architecture:** A small shared layer (`Icon` gets `fill`/`strokeWidth`, two new CSS animation utilities, one `useLikePop` hook) is reused across every card/button component. `ProfileCard.liked` becomes the single source of truth for "already liked" — populated server-side by `/api/profiles/explorer` and updated client-side optimistically after a successful like — instead of each screen inventing its own ad-hoc tracking (or none at all).

**Tech Stack:** Next.js 16 App Router, React 19 client components, Tailwind v4 (`globals.css` `@theme`/keyframes, no config-level theme), Prisma 5, Vitest + `vitest-mock-extended` (`prismaMock`) for server-route tests. No React component/hook test harness exists in this repo (no `@testing-library/react`, no jsdom component tests) — UI-only changes are verified by `pnpm typecheck` + manual `pnpm dev` browser check, not automated tests, matching the codebase's existing convention (see Task 16).

## Global Constraints

- Every Route Handler keeps `export const runtime = 'nodejs'` — not touched here, both modified routes already have it.
- `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass before this is considered done (CLAUDE.md).
- Don't touch any file in CLAUDE.md's "Files Claude must NOT modify" list — none of the files in this plan are on that list.
- Payment amounts / withdrawal / webhook / auth invariants are irrelevant to this plan — no file here touches those subsystems.
- Reduced-motion: every new CSS animation must be neutralized under `@media (prefers-reduced-motion: reduce)`, matching the existing 4 animation classes in `globals.css`.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — no `any` casts (existing test files use `as never` on Prisma mock return values only, which is the established pattern — reuse it, don't invent a different escape hatch).

---

### Task 1: `Icon` — support `fill` and `strokeWidth`

**Files:**
- Modify: `frontend/src/components/ui/Icon.tsx`

**Interfaces:**
- Produces: `Icon({ name, size?, className?, fill?, strokeWidth? })` — `fill`/`strokeWidth` are new optional props forwarded to the underlying Lucide component. Every later task that renders a heart icon relies on this `fill` prop existing.

- [ ] **Step 1: Add the two props and forward them**

Edit `frontend/src/components/ui/Icon.tsx`, replacing the whole `Icon` function (currently lines 97-108):

```tsx
export function Icon({
  name,
  size = 18,
  className,
  fill,
  strokeWidth,
}: {
  name: IconName;
  size?: number;
  className?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  const Component = ICONS[name];
  return (
    <Component
      size={size}
      className={className}
      fill={fill}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (every existing `<Icon .../>` call site omits the two new optional props, which is valid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Icon.tsx
git commit -m "feat(ui): support fill/strokeWidth on Icon for filled-heart states"
```

---

### Task 2: Shared animation utilities in `globals.css`

**Files:**
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: two new utility classes, `.animate-heart-pop` and `.btn-success-flash`, usable by className string in any component from Task 6 onward. Both are neutralized under `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Add the `heart-pop` keyframe and the two utility classes**

Edit `frontend/src/app/globals.css`. Insert immediately after the existing `.animate-scale-in { ... }` block (currently lines 98-100) and before the `@media (prefers-reduced-motion: reduce)` block:

```css
@keyframes heart-pop {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}
.animate-heart-pop {
  animation: heart-pop 0.28s ease-out;
}
/* Smooth color/background transition for buttons that flip to a
   "done" state (liked, accepted) instead of snapping instantly. */
.btn-success-flash {
  transition:
    background-color 0.2s ease-out,
    color 0.2s ease-out;
}
```

- [ ] **Step 2: Add `.animate-heart-pop` to the reduced-motion override**

Edit the existing block (currently lines 102-109):

```css
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-down,
  .animate-fade-in,
  .animate-fade-in-up,
  .animate-scale-in {
    animation: none;
  }
}
```

Replace with:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-down,
  .animate-fade-in,
  .animate-fade-in-up,
  .animate-scale-in,
  .animate-heart-pop {
    animation: none;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(ui): add heart-pop keyframe and btn-success-flash utility"
```

---

### Task 3: Backend — `GET /api/profiles/explorer` returns `liked` per profile

**Files:**
- Modify: `frontend/src/app/api/profiles/explorer/route.ts`
- Test: `frontend/src/app/api/profiles/explorer/route.test.ts` (new)

**Interfaces:**
- Consumes: `prismaMock` from `@/test-utils/prisma-mock` (existing).
- Produces: response shape `{ profiles: (ProfileCard & { liked: boolean })[], page, pageSize, total, hasMore }` — `liked` is `true` iff a `Like` row exists with `likerId = caller` and `likedId = <that profile's userId>`. Task 5 (frontend `ProfileCard` type) and Task 7-8 (card components) depend on this field existing on every profile object returned by this endpoint.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/profiles/explorer/route.test.ts`:

```ts
// Covers the `liked` field added to each returned profile card (2026-08-12)
// — grid/deck cards need to know whether the caller already liked a profile
// so the heart can render filled on load, not just right after a click.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Profile } from '@prisma/client';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'me-1', email: 'me@example.com' } };

function makeProfile(overrides: Partial<Profile> & { userId: string }): Profile {
  return {
    id: `profile_${overrides.userId}`,
    userId: overrides.userId,
    gender: 'FEMME',
    firstName: 'Awa',
    lastName: null,
    dateOfBirth: new Date('1995-01-01'),
    city: 'Kinshasa',
    commune: null,
    religion: null,
    maritalStatus: null,
    childrenCount: null,
    wantsChildren: null,
    relocateOpen: null,
    qualities: null,
    flaws: null,
    dealbreakers: null,
    interestedIn: null,
    intent: 'LONG_TERME',
    job: null,
    bio: null,
    interests: [],
    languages: [],
    visibilityPublic: true,
    onlineStatusVisible: true,
    searchPrefs: null,
    verifiedAt: null,
    verificationStatus: 'PENDING',
    onboardingCompletedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Profile;
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/profiles/explorer', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.profile.findUnique.mockResolvedValue(makeProfile({ userId: 'me-1', gender: 'HOMME' }));
  prismaMock.blockedUser.findMany.mockResolvedValue([]);
});

describe('GET /api/profiles/explorer — liked field', () => {
  it('Test 1: marks a profile as liked when a Like row exists for the caller', async () => {
    const candidateA = { ...makeProfile({ userId: 'user-a' }), photos: [] };
    const candidateB = { ...makeProfile({ userId: 'user-b' }), photos: [] };
    prismaMock.profile.count.mockResolvedValue(2 as never);
    prismaMock.profile.findMany.mockResolvedValue([candidateA, candidateB] as never);
    prismaMock.like.findMany.mockResolvedValue([{ likedId: 'user-a' }] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profiles.find((p: { userId: string }) => p.userId === 'user-a').liked).toBe(true);
    expect(body.profiles.find((p: { userId: string }) => p.userId === 'user-b').liked).toBe(false);
  });

  it('Test 2: skips the Like lookup when the page has no profiles', async () => {
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profiles).toEqual([]);
    expect(prismaMock.like.findMany).not.toHaveBeenCalled();
  });

  it('Test 3: scopes the Like lookup to the caller as likerId', async () => {
    const candidateA = { ...makeProfile({ userId: 'user-a' }), photos: [] };
    prismaMock.profile.count.mockResolvedValue(1 as never);
    prismaMock.profile.findMany.mockResolvedValue([candidateA] as never);
    prismaMock.like.findMany.mockResolvedValue([] as never);

    await GET(makeGet());

    const args = prismaMock.like.findMany.mock.calls[0]?.[0];
    expect(args?.where?.likerId).toBe('me-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/profiles/explorer/route.test.ts`
Expected: FAIL — `body.profiles[...].liked` is `undefined`, not `true`/`false` (the route doesn't compute it yet).

- [ ] **Step 3: Implement the `liked` field**

Edit `frontend/src/app/api/profiles/explorer/route.ts`, replacing this block (currently lines 90-110):

```ts
    const [total, profiles] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    return NextResponse.json(
      {
        profiles: profiles.map(toProfileCard),
        page: q.page,
        pageSize: q.pageSize,
        total,
        hasMore: q.page * q.pageSize < total,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
```

with:

```ts
    const [total, profiles] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    // "liked" lets grid/deck cards render a filled heart for profiles the
    // caller already liked in a previous session — explorer (unlike
    // discover) does not exclude already-liked profiles from the pool.
    const likedRows =
      profiles.length > 0
        ? await prisma.like.findMany({
            where: { likerId: auth.user.sub, likedId: { in: profiles.map((p) => p.userId) } },
            select: { likedId: true },
          })
        : [];
    const likedSet = new Set(likedRows.map((r) => r.likedId));

    return NextResponse.json(
      {
        profiles: profiles.map((p) => ({ ...toProfileCard(p), liked: likedSet.has(p.userId) })),
        page: q.page,
        pageSize: q.pageSize,
        total,
        hasMore: q.page * q.pageSize < total,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/profiles/explorer/route.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/profiles/explorer/route.ts frontend/src/app/api/profiles/explorer/route.test.ts
git commit -m "feat(api): return liked flag per profile from /api/profiles/explorer"
```

---

### Task 4: Frontend `ProfileCard` type gains `liked`

**Files:**
- Modify: `frontend/src/lib/yeoyo/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProfileCard.liked?: boolean` — optional so every existing caller of `toProfileCard` (which never sets it) stays valid; only `/api/profiles/explorer` (Task 3) populates it. All card components read `profile.liked ?? false`.

- [ ] **Step 1: Add the field**

Edit `frontend/src/lib/yeoyo/types.ts`, in the `ProfileCard` interface (currently lines 1-21), add one line after `dealbreakers: string | null;`:

```ts
export interface ProfileCard {
  userId: string;
  firstName: string;
  age: number;
  job: string | null;
  commune: string | null;
  intent: string;
  tags: string[];
  photoUrl: string | null;
  photoUrls: string[];
  verified: boolean;
  bio: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  qualities: string | null;
  flaws: string | null;
  dealbreakers: string | null;
  // Only populated by endpoints that know the caller's identity and compute
  // it server-side (currently /api/profiles/explorer and /api/profiles/[userId]
  // via a sibling field) — undefined elsewhere, treat as "not liked".
  liked?: boolean;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (optional field, purely additive).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/yeoyo/types.ts
git commit -m "feat(types): add optional liked field to ProfileCard"
```

---

### Task 5: `useLikePop` hook

**Files:**
- Create: `frontend/src/lib/yeoyo/useLikePop.ts`

**Interfaces:**
- Consumes: a `liked: boolean` value (the current, persisted liked state of one card).
- Produces: `useLikePop(liked: boolean): boolean` — returns `true` for ~300ms right after `liked` transitions from `false` to `true`, and `false` otherwise (including on initial mount when a card loads already-liked, so the bounce never replays for stale state). Tasks 6-11 and 13-15 all import this.

- [ ] **Step 1: Write the hook**

Create `frontend/src/lib/yeoyo/useLikePop.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';

// Drives the .animate-heart-pop bounce for exactly one cycle right after a
// like succeeds — not on mount, so a profile that was already liked in a
// previous session doesn't replay the animation every time its card renders.
export function useLikePop(liked: boolean): boolean {
  const prevLikedRef = useRef(liked);
  const [popping, setPopping] = useState(false);

  useEffect(() => {
    const justLiked = liked && !prevLikedRef.current;
    prevLikedRef.current = liked;
    if (!justLiked) return undefined;
    setPopping(true);
    const timer = setTimeout(() => setPopping(false), 300);
    return () => clearTimeout(timer);
  }, [liked]);

  return popping;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/yeoyo/useLikePop.ts
git commit -m "feat(yeoyo): add useLikePop hook driving the heart-pop animation"
```

---

### Task 6: `SwipeCard` — filled heart, pop animation, spinners

**Files:**
- Modify: `frontend/src/components/yeoyo/SwipeCard.tsx`

**Interfaces:**
- Consumes: `useLikePop` (Task 5), `Icon`'s `fill` prop (Task 1), `profile.liked` (Task 4), `.animate-heart-pop`/`.btn-success-flash` (Task 2).
- Produces: no prop signature change — `busy` still means "this specific card is in flight," now supplied per-card by the parent (Task 10).

- [ ] **Step 1: Add the hook call and `liked` derivation**

Edit `frontend/src/components/yeoyo/SwipeCard.tsx`. Add the import and two lines right after the existing hooks (after line 50, `const pointerIdRef = useRef<number | null>(null);`):

```tsx
  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);
```

Add the import alongside the existing ones (after line 27, `import type { ProfileCard } from '@/lib/yeoyo/types';`):

```tsx
import { useLikePop } from '@/lib/yeoyo/useLikePop';
```

- [ ] **Step 2: Update the Message and Like buttons**

Replace the footer's Message and Like buttons (currently lines 168-185):

```tsx
        <button
          type="button"
          onClick={() => onMessage(profile.userId)}
          disabled={busy}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground disabled:opacity-50"
        >
          <Icon name="message-circle" size={17} />
          <span className="font-body text-sm font-semibold">Message</span>
        </button>
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={busy}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Ajouter aux favoris"
        >
          <Icon name="heart" size={20} />
        </button>
```

with:

```tsx
        <button
          type="button"
          onClick={() => onMessage(profile.userId)}
          disabled={busy}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground disabled:opacity-50"
        >
          {busy ? (
            <Icon name="refresh-cw" size={17} className="animate-spin" />
          ) : (
            <Icon name="message-circle" size={17} />
          )}
          <span className="font-body text-sm font-semibold">Message</span>
        </button>
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={busy || liked}
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full btn-success-flash disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
          aria-label={liked ? 'Déjà aimé' : 'Ajouter aux favoris'}
        >
          {busy ? (
            <Icon name="refresh-cw" size={20} className="animate-spin" />
          ) : (
            <Icon
              name="heart"
              size={20}
              fill={liked ? 'currentColor' : 'none'}
              className={popping ? 'animate-heart-pop' : ''}
            />
          )}
        </button>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/yeoyo/SwipeCard.tsx
git commit -m "feat(yeoyo): filled-heart animation + spinners on SwipeCard actions"
```

---

### Task 7: `ProfileGridCard` — same treatment as SwipeCard

**Files:**
- Modify: `frontend/src/components/yeoyo/ProfileGridCard.tsx`

**Interfaces:**
- Same as Task 6.

- [ ] **Step 1: Add the hook call and `liked` derivation**

Edit `frontend/src/components/yeoyo/ProfileGridCard.tsx`. Add the import after line 10 (`import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';`):

```tsx
import { useLikePop } from '@/lib/yeoyo/useLikePop';
```

Add inside the component body, right after the function signature's opening (after line 24, `}) {`):

```tsx
  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);
```

- [ ] **Step 2: Update the Message and Like buttons**

Replace (currently lines 87-104):

```tsx
          <button
            type="button"
            onClick={() => onMessage(profile.userId)}
            disabled={busy}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-foreground disabled:opacity-50"
          >
            <Icon name="message-circle" size={15} />
            <span className="font-body text-sm font-medium">Message</span>
          </button>
          <button
            type="button"
            onClick={() => onLike(profile.userId)}
            disabled={busy}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            aria-label="Liker ce profil"
          >
            <Icon name="heart" size={18} />
          </button>
```

with:

```tsx
          <button
            type="button"
            onClick={() => onMessage(profile.userId)}
            disabled={busy}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-foreground disabled:opacity-50"
          >
            {busy ? (
              <Icon name="refresh-cw" size={15} className="animate-spin" />
            ) : (
              <Icon name="message-circle" size={15} />
            )}
            <span className="font-body text-sm font-medium">Message</span>
          </button>
          <button
            type="button"
            onClick={() => onLike(profile.userId)}
            disabled={busy || liked}
            aria-label={liked ? 'Déjà aimé' : 'Liker ce profil'}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg btn-success-flash disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
          >
            {busy ? (
              <Icon name="refresh-cw" size={18} className="animate-spin" />
            ) : (
              <Icon
                name="heart"
                size={18}
                fill={liked ? 'currentColor' : 'none'}
                className={popping ? 'animate-heart-pop' : ''}
              />
            )}
          </button>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/yeoyo/ProfileGridCard.tsx
git commit -m "feat(yeoyo): filled-heart animation + spinners on ProfileGridCard actions"
```

---

### Task 8: `RecommendedProfileCard` — same treatment

**Files:**
- Modify: `frontend/src/components/yeoyo/RecommendedProfileCard.tsx`

**Interfaces:**
- Same as Task 6, minus the Message button (this card has none, per its own header comment).

- [ ] **Step 1: Add the hook call and `liked` derivation**

Edit `frontend/src/components/yeoyo/RecommendedProfileCard.tsx`. Add the import after line 13 (`import type { ProfileCard } from '@/lib/yeoyo/types';`):

```tsx
import { useLikePop } from '@/lib/yeoyo/useLikePop';
```

Add inside the component body, right after the function signature's opening (after line 26, `}) {`):

```tsx
  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);
```

- [ ] **Step 2: Update the like button**

Replace (currently lines 46-54):

```tsx
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={liking}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-primary disabled:opacity-50"
          aria-label="Aimer ce profil"
        >
          <Icon name="heart" size={14} />
        </button>
```

with:

```tsx
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={liking || liked}
          aria-label={liked ? 'Déjà aimé' : 'Aimer ce profil'}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full btn-success-flash disabled:opacity-50 ${liked ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-primary'}`}
        >
          {liking ? (
            <Icon name="refresh-cw" size={14} className="animate-spin" />
          ) : (
            <Icon
              name="heart"
              size={14}
              fill={liked ? 'currentColor' : 'none'}
              className={popping ? 'animate-heart-pop' : ''}
            />
          )}
        </button>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/yeoyo/RecommendedProfileCard.tsx
git commit -m "feat(yeoyo): filled-heart animation + spinner on RecommendedProfileCard"
```

---

### Task 9: `ContactRequestCard` — spinners on accept/decline

**Files:**
- Modify: `frontend/src/components/yeoyo/ContactRequestCard.tsx`

**Interfaces:**
- No new props — `responding` already exists and already scopes to one row (this component was already correct on the per-row busy-state front, per the audit).

- [ ] **Step 1: Update the Decline and Accept buttons**

Replace (currently lines 60-79):

```tsx
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={responding}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground disabled:opacity-50"
            aria-label="Refuser"
          >
            <Icon name="x" size={16} />
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={responding}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50"
          >
            <Icon name="check" size={16} />
            <span className="font-body text-sm font-semibold">Accepter</span>
          </button>
        </div>
```

with:

```tsx
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={responding}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground disabled:opacity-50"
            aria-label="Refuser"
          >
            {responding ? (
              <Icon name="refresh-cw" size={16} className="animate-spin" />
            ) : (
              <Icon name="x" size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={responding}
            className="btn-success-flash flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50"
          >
            {responding ? (
              <Icon name="refresh-cw" size={16} className="animate-spin" />
            ) : (
              <Icon name="check" size={16} />
            )}
            <span className="font-body text-sm font-semibold">Accepter</span>
          </button>
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/yeoyo/ContactRequestCard.tsx
git commit -m "feat(yeoyo): spinner feedback on ContactRequestCard accept/decline"
```

---

### Task 10: `explorer/page.tsx` — per-card busy state + optimistic `liked`

**Files:**
- Modify: `frontend/src/app/app/explorer/page.tsx`

**Interfaces:**
- Consumes: `SwipeCard`/`ProfileGridCard`'s unchanged `busy?: boolean` prop (Tasks 6-7), `ProfileCard.liked` (Task 4).
- Produces: replaces the single shared `busy: boolean` state with `busyUserId: string | null`, so only the clicked card disables/spins.

- [ ] **Step 1: Replace the `busy` state**

Edit `frontend/src/app/app/explorer/page.tsx`, replacing line 83:

```tsx
  const [busy, setBusy] = useState(false);
```

with:

```tsx
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
```

- [ ] **Step 2: Update `onLike`**

Replace (currently lines 144-155):

```tsx
  async function onLike(targetUserId: string) {
    setBusy(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
      advance();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }
```

with:

```tsx
  async function onLike(targetUserId: string) {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      setDeck((prev) => prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)));
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
      advance();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyUserId(null);
    }
  }
```

- [ ] **Step 3: Update `onMessage`, `onLikeGrid`, `onMessageGrid`**

Replace (currently lines 157-203):

```tsx
  async function onMessage(targetUserId: string) {
    setBusy(true);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Grid mode — no single-card pointer, so actions don't "advance"; dismiss
  // just removes the card from the currently-loaded grid.
  function onDismissGrid(targetUserId: string) {
    setDeck((prev) => prev.filter((p) => p.userId !== targetUserId));
  }

  async function onLikeGrid(targetUserId: string) {
    setBusy(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onMessageGrid(targetUserId: string) {
    setBusy(true);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }
```

with:

```tsx
  async function onMessage(targetUserId: string) {
    setBusyUserId(targetUserId);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  // Grid mode — no single-card pointer, so actions don't "advance"; dismiss
  // just removes the card from the currently-loaded grid.
  function onDismissGrid(targetUserId: string) {
    setDeck((prev) => prev.filter((p) => p.userId !== targetUserId));
  }

  async function onLikeGrid(targetUserId: string) {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      setDeck((prev) => prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)));
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  async function onMessageGrid(targetUserId: string) {
    setBusyUserId(targetUserId);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyUserId(null);
    }
  }
```

- [ ] **Step 4: Update the render sites**

Replace the `SwipeCard` render (currently lines 396-405):

```tsx
        {!loading && !error && viewMode === 'swipe' && current && (
          <SwipeCard
            key={current.userId}
            profile={current}
            onDismiss={onDismiss}
            onMessage={onMessage}
            onLike={onLike}
            busy={busy}
          />
        )}
```

with:

```tsx
        {!loading && !error && viewMode === 'swipe' && current && (
          <SwipeCard
            key={current.userId}
            profile={current}
            onDismiss={onDismiss}
            onMessage={onMessage}
            onLike={onLike}
            busy={busyUserId === current.userId}
          />
        )}
```

Replace the `ProfileGridCard` render (currently lines 428-437):

```tsx
              {deck.map((p) => (
                <ProfileGridCard
                  key={p.userId}
                  profile={p}
                  onLike={onLikeGrid}
                  onMessage={onMessageGrid}
                  onDismiss={onDismissGrid}
                  busy={busy}
                />
              ))}
```

with:

```tsx
              {deck.map((p) => (
                <ProfileGridCard
                  key={p.userId}
                  profile={p}
                  onLike={onLikeGrid}
                  onMessage={onMessageGrid}
                  onDismiss={onDismissGrid}
                  busy={busyUserId === p.userId}
                />
              ))}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (`busy` identifier no longer exists anywhere in this file — a leftover reference would show up as a typecheck/lint error).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/app/explorer/page.tsx
git commit -m "fix(yeoyo): scope Explorer's busy state to one card, sync liked locally"
```

---

### Task 11: `decouvrir/page.tsx` — same per-card busy fix

**Files:**
- Modify: `frontend/src/app/app/decouvrir/page.tsx`

**Interfaces:**
- Same pattern as Task 10, applied to `RecommendedProfileCard`'s `liking` prop.

- [ ] **Step 1: Replace the `acting` state**

Edit `frontend/src/app/app/decouvrir/page.tsx`, replacing line 97:

```tsx
  const [acting, setActing] = useState(false);
```

with:

```tsx
  const [actingUserId, setActingUserId] = useState<string | null>(null);
```

- [ ] **Step 2: Update `onLike`**

Replace (currently lines 127-137):

```tsx
  async function onLike(targetUserId: string) {
    setActing(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setActing(false);
    }
  }
```

with:

```tsx
  async function onLike(targetUserId: string) {
    setActingUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      setRecommended((prev) =>
        prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)),
      );
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setActingUserId(null);
    }
  }
```

- [ ] **Step 3: Update the render site**

Replace (currently lines 238-246):

```tsx
                  {recommended.map((p) => (
                    <RecommendedProfileCard
                      key={p.userId}
                      profile={p}
                      onLike={onLike}
                      liking={acting}
                      note={matchNote(profile, p)}
                    />
                  ))}
```

with:

```tsx
                  {recommended.map((p) => (
                    <RecommendedProfileCard
                      key={p.userId}
                      profile={p}
                      onLike={onLike}
                      liking={actingUserId === p.userId}
                      note={matchNote(profile, p)}
                    />
                  ))}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app/decouvrir/page.tsx
git commit -m "fix(yeoyo): scope Découvrir's like busy state to one card, sync liked locally"
```

---

### Task 12: `demandes/page.tsx` — immediate local removal on ACCEPT

**Files:**
- Modify: `frontend/src/app/app/demandes/page.tsx`

**Interfaces:**
- No prop/type changes — behavioral fix only.

- [ ] **Step 1: Update `respond`**

Replace (currently lines 91-110):

```tsx
  async function respond(id: string, action: 'ACCEPT' | 'DECLINE') {
    setRespondingId(id);
    try {
      const res = await api<{ status: string; conversationId: string | null }>(
        `/api/contact-requests/${id}/respond`,
        { method: 'POST', body: { action } },
      );
      if (action === 'ACCEPT' && res.conversationId) {
        toast('Demande acceptée — conversation ouverte', 'success');
        router.push(`/app/messages/${res.conversationId}`);
        return;
      }
      toast('Demande refusée', 'success');
      setReceived((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setRespondingId(null);
    }
  }
```

with:

```tsx
  async function respond(id: string, action: 'ACCEPT' | 'DECLINE') {
    setRespondingId(id);
    try {
      const res = await api<{ status: string; conversationId: string | null }>(
        `/api/contact-requests/${id}/respond`,
        { method: 'POST', body: { action } },
      );
      // Remove the row immediately on either outcome — previously ACCEPT
      // relied entirely on navigating away, so a delayed/blocked navigation
      // left the row visibly stuck on PENDING after the server had already
      // resolved it.
      setReceived((prev) => prev.filter((r) => r.id !== id));
      if (action === 'ACCEPT' && res.conversationId) {
        toast('Demande acceptée — conversation ouverte', 'success');
        router.push(`/app/messages/${res.conversationId}`);
        return;
      }
      toast('Demande refusée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setRespondingId(null);
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/app/demandes/page.tsx
git commit -m "fix(yeoyo): remove request row locally on accept, not just on decline"
```

---

### Task 13: `likes/page.tsx` — `LikeBackButton` with pop animation + fixed state sync

**Files:**
- Modify: `frontend/src/app/app/likes/page.tsx`

**Interfaces:**
- Consumes: `useLikePop` (Task 5).
- Produces: a new, file-local (not exported) `LikeBackButton` component — needed because `useLikePop` is a hook and hooks can't be called inside the `.map()` callback that renders each row.

- [ ] **Step 1: Add the `useLikePop` import and the `LikeBackButton` component**

Edit `frontend/src/app/app/likes/page.tsx`. Add the import after line 15 (`import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';`):

```tsx
import { useLikePop } from '@/lib/yeoyo/useLikePop';
```

Add this component right before `export default function LikesPage()` (currently line 24):

```tsx
function LikeBackButton({
  liked,
  busy,
  onClick,
}: {
  liked: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const popping = useLikePop(liked);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={liked || busy}
      aria-label={liked ? 'Déjà aimé' : 'Aimer en retour'}
      className={`btn-success-flash flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-primary-foreground disabled:opacity-50 sm:px-4 ${liked ? 'bg-primary/60' : 'bg-primary'}`}
    >
      {busy ? (
        <Icon name="refresh-cw" size={15} className="animate-spin" />
      ) : (
        <Icon
          name="heart"
          size={15}
          fill={liked ? 'currentColor' : 'none'}
          className={popping ? 'animate-heart-pop' : ''}
        />
      )}
      <span className="hidden font-body text-sm font-semibold sm:inline">
        {liked ? 'Aimé' : 'Aimer en retour'}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Fix `likeBack` to sync local state and always clear `likingId`**

Replace (currently lines 49-62):

```tsx
  async function likeBack(userId: string) {
    setLikingId(userId);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId: userId },
      });
      toast('C’est un match — direction la conversation !', 'success');
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      setLikingId(null);
    }
  }
```

with:

```tsx
  async function likeBack(userId: string) {
    setLikingId(userId);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId: userId },
      });
      setLikes((prev) =>
        prev.map((l) => (l.profile.userId === userId ? { ...l, likedBack: true } : l)),
      );
      toast('C’est un match — direction la conversation !', 'success');
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLikingId(null);
    }
  }
```

- [ ] **Step 3: Use `LikeBackButton` in the row**

Replace (currently lines 112-123):

```tsx
            <button
              type="button"
              onClick={() => likeBack(l.profile.userId)}
              disabled={l.likedBack || likingId === l.profile.userId}
              aria-label={l.likedBack ? 'Déjà aimé' : 'Aimer en retour'}
              className="flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-primary-foreground disabled:opacity-50 sm:px-4"
            >
              <Icon name="heart" size={15} />
              <span className="hidden font-body text-sm font-semibold sm:inline">
                {l.likedBack ? 'Aimé' : 'Aimer en retour'}
              </span>
            </button>
```

with:

```tsx
            <LikeBackButton
              liked={l.likedBack}
              busy={likingId === l.profile.userId}
              onClick={() => likeBack(l.profile.userId)}
            />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app/likes/page.tsx
git commit -m "fix(yeoyo): sync likedBack locally and add pop animation on Mes likes"
```

---

### Task 14: `messages/[id]/page.tsx` — animate "Ajouter un like"

**Files:**
- Modify: `frontend/src/app/app/messages/[id]/page.tsx`

**Interfaces:**
- Consumes: `useLikePop` (Task 5). Does not touch `liked`'s initial value (still starts `false` on thread load, unchanged — populating it from the server is a separate, larger change to the conversation-detail endpoint and is out of this plan's scope).

- [ ] **Step 1: Add the `useLikePop` import and a busy flag for the like action**

Edit `frontend/src/app/app/messages/[id]/page.tsx`. Add the import after line 34 (`import { useConversations } from '@/lib/yeoyo/useConversations';`):

```tsx
import { useLikePop } from '@/lib/yeoyo/useLikePop';
```

Add a new state declaration right after line 81 (`const [liked, setLiked] = useState(false);`):

```tsx
  const [addingLike, setAddingLike] = useState(false);
```

Add the hook call in the same area (component body, before the first `useCallback`/`useEffect` — any point after the `useState` declarations works):

```tsx
  const likePopping = useLikePop(liked);
```

- [ ] **Step 2: Update `addLike` to track the busy flag**

Replace (currently lines 228-237):

```tsx
  async function addLike() {
    if (!active) return;
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId: active.otherUser.userId } });
      setLiked(true);
      toast('Profil aimé', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }
```

with:

```tsx
  async function addLike() {
    if (!active) return;
    setAddingLike(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId: active.otherUser.userId } });
      setLiked(true);
      toast('Profil aimé', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setAddingLike(false);
    }
  }
```

- [ ] **Step 3: Update the button**

Replace (currently lines 581-589):

```tsx
                <button
                  type="button"
                  onClick={() => void addLike()}
                  disabled={liked}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Icon name="heart" size={14} />
                  {liked ? 'Profil aimé' : 'Ajouter un like'}
                </button>
```

with:

```tsx
                <button
                  type="button"
                  onClick={() => void addLike()}
                  disabled={liked || addingLike}
                  className={`btn-success-flash flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 font-body text-sm font-medium disabled:opacity-50 ${liked ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-background text-foreground'}`}
                >
                  {addingLike ? (
                    <Icon name="refresh-cw" size={14} className="animate-spin" />
                  ) : (
                    <Icon
                      name="heart"
                      size={14}
                      fill={liked ? 'currentColor' : 'none'}
                      className={likePopping ? 'animate-heart-pop' : ''}
                    />
                  )}
                  {liked ? 'Profil aimé' : 'Ajouter un like'}
                </button>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/app/messages/[id]/page.tsx"
git commit -m "feat(yeoyo): animate the thread's Ajouter un like button"
```

---

### Task 15: `profils/[userId]/page.tsx` — reuse the shared animation system

**Files:**
- Modify: `frontend/src/app/app/profils/[userId]/page.tsx`

**Interfaces:**
- Consumes: `useLikePop` (Task 5). This page's `liked` state was already correct functionally (only one in the whole app) — this task only aligns its visuals with the new shared system and adds spinners.

- [ ] **Step 1: Add the `useLikePop` import and hook call**

Edit `frontend/src/app/app/profils/[userId]/page.tsx`. Add the import after line 23 (`import type { ProfileCard } from '@/lib/yeoyo/types';`):

```tsx
import { useLikePop } from '@/lib/yeoyo/useLikePop';
```

Add right after line 33 (`const [liked, setLiked] = useState(false);`):

```tsx
  const popping = useLikePop(liked);
```

- [ ] **Step 2: Update the Message and Like buttons**

Replace (currently lines 197-216):

```tsx
                <button
                  type="button"
                  onClick={() => void onMessage()}
                  disabled={busy}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground disabled:opacity-50"
                >
                  <Icon name="message-circle" size={17} />
                  <span className="font-body text-sm font-semibold">Message</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onLike()}
                  disabled={busy}
                  className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
                  aria-label={liked ? 'Déjà aimé' : 'Aimer ce profil'}
                >
                  <Icon name="heart" size={20} />
                </button>
```

with:

```tsx
                <button
                  type="button"
                  onClick={() => void onMessage()}
                  disabled={busy}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground disabled:opacity-50"
                >
                  {busy ? (
                    <Icon name="refresh-cw" size={17} className="animate-spin" />
                  ) : (
                    <Icon name="message-circle" size={17} />
                  )}
                  <span className="font-body text-sm font-semibold">Message</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onLike()}
                  disabled={busy || liked}
                  className={`btn-success-flash flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
                  aria-label={liked ? 'Déjà aimé' : 'Aimer ce profil'}
                >
                  {busy ? (
                    <Icon name="refresh-cw" size={20} className="animate-spin" />
                  ) : (
                    <Icon
                      name="heart"
                      size={20}
                      fill={liked ? 'currentColor' : 'none'}
                      className={popping ? 'animate-heart-pop' : ''}
                    />
                  )}
                </button>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/app/profils/[userId]/page.tsx"
git commit -m "feat(yeoyo): align profile-detail like button with shared animation system"
```

---

### Task 16: Full verification gate + manual browser check

**Files:** none (verification only).

- [ ] **Step 1: Run the full pre-commit gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all four pass, including the 3 new tests from Task 3 and the full existing suite (555+ prior tests unaffected).

- [ ] **Step 2: Manual browser verification**

Run: `pnpm dev`, then in a browser:
1. Log in, go to `/app/explorer` (swipe mode) — like a profile, confirm the heart button shows a spinner mid-request then the card advances.
2. Switch to grid mode — like a card, confirm only that card's heart fills/bounces and disables, other cards stay interactive (this is the busy-state-scoping fix — reload the page or navigate back to Explorer to see the same profile keep its filled heart if it reappears).
3. Go to `/app/decouvrir` — like a card in "Sélection pour toi", confirm the same filled/bounce/disabled behavior and that other recommended cards stay clickable.
4. Go to `/app/demandes`, Reçues tab — accept one request, confirm the row disappears immediately (not just after the redirect lands) and the button showed a spinner.
5. Go to `/app/likes` — click "Aimer en retour" on a row, confirm the heart fills, bounces, the button disables, and the label flips to "Aimé" before navigating away.
6. Open a conversation thread (`/app/messages/[id]`), click "Ajouter un like" if visible, confirm spinner then filled heart + "Profil aimé".
7. Open a profile detail page (`/app/profils/[userId]`) for a profile not yet liked, click the heart, confirm spinner then the existing filled state — should look and animate the same as steps above now.
8. With OS-level "reduce motion" enabled, repeat step 2 — confirm the heart still fills/disables correctly but doesn't visibly bounce (no step needed if this isn't easy to toggle in your environment — spot check is enough).

Expected: every interaction above shows a spinner while in flight and a persistently filled/colored state afterward — no more "click and nothing visibly changes" moments on any of the 6 screens.

- [ ] **Step 3: Fix anything found, then stop**

If any check in Step 2 fails, fix the specific file involved (all files are listed in Tasks 6-15 above) and re-run `pnpm typecheck` before re-testing in the browser. No commit needed for this task — Steps 1-2 are verification, not new changes, unless Step 3 required a fix (then commit that fix normally with a `fix(yeoyo): ...` message).
