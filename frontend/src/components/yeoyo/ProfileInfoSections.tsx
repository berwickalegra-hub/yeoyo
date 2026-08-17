// Shared "below the photo" info blocks — bio / métier+intention+projet de
// vie grid / qualités / défauts / limites. Extracted from SwipeCard
// (2026-08-10) so the new profile-detail screen renders the exact same
// sections instead of forking the JSX. Every block is conditional — a
// profile that skipped a field simply doesn't render that section, no
// placeholder/fake content.
import { Icon } from '@/components/ui/Icon';
import {
  INTENT_LABELS,
  WANTS_CHILDREN_LABELS,
  RELOCATE_LABELS,
  RELIGION_LABELS,
  MARITAL_STATUS_LABELS,
  type ProfileCard,
} from '@/lib/yeoyo/types';

export function ProfileInfoSections({ profile }: { profile: ProfileCard }) {
  return (
    <>
      {profile.bio && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-primary">
            <Icon name="heart" size={13} />
            <span className="font-headings text-xs font-semibold uppercase tracking-widest">
              Sa vision du mariage
            </span>
          </div>
          <p className="font-body text-sm text-foreground">{profile.bio}</p>
        </div>
      )}

      {(profile.job ||
        profile.intent ||
        profile.religion ||
        profile.maritalStatus ||
        profile.wantsChildren ||
        profile.relocateOpen) && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
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
      )}

      {profile.interests.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-primary">
            <Icon name="sparkles" size={13} />
            <span className="font-headings text-xs font-semibold uppercase tracking-widest">
              Centres d&apos;intérêt
            </span>
          </div>
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
        </div>
      )}

      {profile.qualities && (
        <div className="border-t border-border pt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-primary">
            <Icon name="star" size={13} />
            <span className="font-headings text-xs font-semibold uppercase tracking-widest">
              Ses qualités
            </span>
          </div>
          <p className="font-body text-sm text-foreground">{profile.qualities}</p>
        </div>
      )}

      {profile.flaws && (
        <div className="border-t border-border pt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-primary">
            <Icon name="info" size={13} />
            <span className="font-headings text-xs font-semibold uppercase tracking-widest">
              Ses défauts
            </span>
          </div>
          <p className="font-body text-sm text-foreground">{profile.flaws}</p>
        </div>
      )}

      {profile.dealbreakers && (
        <div className="border-t border-border pt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-primary">
            <Icon name="ban" size={13} />
            <span className="font-headings text-xs font-semibold uppercase tracking-widest">
              Limites
            </span>
          </div>
          <p className="font-body text-sm text-foreground">{profile.dealbreakers}</p>
        </div>
      )}
    </>
  );
}
