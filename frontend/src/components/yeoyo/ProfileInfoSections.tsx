// Shared "below the photo" info blocks — bio / métier+intention+projet de
// vie grid / centres d'intérêt / qualités / défauts / limites / galerie
// photo. Extracted from SwipeCard (2026-08-10) so the new profile-detail
// screen renders the exact same sections instead of forking the JSX. Every
// block is conditional — a profile that skipped a field simply doesn't
// render that section, no placeholder/fake content.
//
// Card-style blocks (2026-08-28, user-driven: "je veux vraiment que cette
// page puisse savoir les informations publiques sur la personne... chaque
// information peuvent être un peu séparées en blocs et très clairs") — each
// section is now a distinct rounded card (bg-background, warm off-white,
// against the surrounding bg-surface card) instead of a thin top border, so
// scanning while scrolling reads as a series of clear blocks. Also adds the
// "Enfants" field (childrenCount was previously only surfaced as a small
// tag pill, e.g. "1 enfant(s)", under the photo — never in its own labeled
// block) and a photo gallery grid at the end, since the top PhotoCarousel
// only ever shows one photo at a time (WhatsApp-status style) with no way
// to see every photo at a glance.
import { Icon, type IconName } from '@/components/ui/Icon';
import {
  INTENT_LABELS,
  WANTS_CHILDREN_LABELS,
  RELOCATE_LABELS,
  RELIGION_LABELS,
  MARITAL_STATUS_LABELS,
  type ProfileCard,
} from '@/lib/yeoyo/types';

const CHILDREN_COUNT_LABELS: Record<string, string> = {
  '0': 'Aucun',
  '1': '1 enfant',
  '2': '2 enfants',
  '3+': '3 enfants ou plus',
};

function InfoBlock({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <Icon name={icon} size={13} />
        <span className="font-headings text-xs font-semibold uppercase tracking-widest">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export function ProfileInfoSections({
  profile,
  onPhotoClick,
}: {
  profile: ProfileCard;
  // Opens the shared PhotoLightbox at this photo index — the caller (either
  // SwipeCard or the profile-detail page) already owns lightbox state, this
  // component just reports which thumbnail was tapped. Gallery section is
  // omitted entirely if not provided (backward-compatible for any future
  // caller that doesn't want it).
  onPhotoClick?: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {profile.bio && (
        <InfoBlock icon="heart" title="Sa vision du mariage">
          <p className="font-body text-sm text-foreground">{profile.bio}</p>
        </InfoBlock>
      )}

      {(profile.job ||
        profile.intent ||
        profile.religion ||
        profile.maritalStatus ||
        profile.childrenCount ||
        profile.wantsChildren ||
        profile.relocateOpen) && (
        <InfoBlock icon="info" title="Infos">
          <div className="grid grid-cols-2 gap-3">
            {profile.job && (
              <div>
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Métier
                </p>
                <p className="mt-0.5 font-body text-sm text-foreground">{profile.job}</p>
              </div>
            )}
            <div>
              <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                Intention
              </p>
              <p className="mt-0.5 font-body text-sm text-foreground">
                {INTENT_LABELS[profile.intent] ?? profile.intent}
              </p>
            </div>
            {profile.religion && (
              <div>
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Religion
                </p>
                <p className="mt-0.5 font-body text-sm text-foreground">
                  {RELIGION_LABELS[profile.religion] ?? profile.religion}
                </p>
              </div>
            )}
            {profile.maritalStatus && (
              <div>
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Statut marital
                </p>
                <p className="mt-0.5 font-body text-sm text-foreground">
                  {MARITAL_STATUS_LABELS[profile.maritalStatus] ?? profile.maritalStatus}
                </p>
              </div>
            )}
            {profile.childrenCount && (
              <div>
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Enfants
                </p>
                <p className="mt-0.5 font-body text-sm text-foreground">
                  {CHILDREN_COUNT_LABELS[profile.childrenCount] ?? profile.childrenCount}
                </p>
              </div>
            )}
            {profile.wantsChildren && (
              <div>
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Souhaite des enfants
                </p>
                <p className="mt-0.5 font-body text-sm text-foreground">
                  {WANTS_CHILDREN_LABELS[profile.wantsChildren] ?? profile.wantsChildren}
                </p>
              </div>
            )}
            {profile.relocateOpen && (
              <div>
                <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Ouvert(e) à déménager
                </p>
                <p className="mt-0.5 font-body text-sm text-foreground">
                  {RELOCATE_LABELS[profile.relocateOpen] ?? profile.relocateOpen}
                </p>
              </div>
            )}
          </div>
        </InfoBlock>
      )}

      {profile.interests.length > 0 && (
        <InfoBlock icon="sparkles" title="Centres d'intérêt">
          <div className="flex flex-wrap gap-1.5">
            {profile.interests.map((interest) => (
              <span
                key={interest}
                className="rounded-lg bg-accent px-2.5 py-1 font-body text-xs text-foreground"
              >
                {interest}
              </span>
            ))}
          </div>
        </InfoBlock>
      )}

      {profile.qualities && (
        <InfoBlock icon="star" title="Ses qualités">
          <p className="font-body text-sm text-foreground">{profile.qualities}</p>
        </InfoBlock>
      )}

      {profile.flaws && (
        <InfoBlock icon="info" title="Ses défauts">
          <p className="font-body text-sm text-foreground">{profile.flaws}</p>
        </InfoBlock>
      )}

      {profile.dealbreakers && (
        <InfoBlock icon="ban" title="Limites">
          <p className="font-body text-sm text-foreground">{profile.dealbreakers}</p>
        </InfoBlock>
      )}

      {onPhotoClick && profile.photoUrls.length > 0 && (
        <InfoBlock icon="image" title={`Ses photos (${profile.photoUrls.length})`}>
          <div className="grid grid-cols-3 gap-2">
            {profile.photoUrls.map((url, index) => (
              <button
                key={url}
                type="button"
                onClick={() => onPhotoClick(index)}
                aria-label={`Voir la photo ${index + 1} de ${profile.firstName} en grand`}
                className="aspect-square overflow-hidden rounded-lg bg-accent transition-opacity active:opacity-80"
              >
                {/* Thumbnail grid, not the LCP hero image (that's
                    PhotoCarousel/ProfilePhotoCover above) — same
                    plain-img rationale as PhotoLightbox.tsx. */}
                <img
                  src={url}
                  alt={`${profile.firstName}, photo ${index + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </InfoBlock>
      )}
    </div>
  );
}
