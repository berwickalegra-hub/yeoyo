'use client';

// Tap-to-fill chips shown under a free-text field — for the user who
// "ne veut pas écrire" (per chat feedback): tapping a chip fills the field
// with a canned phrase instead of typing from scratch, still editable
// afterward. Used by onboarding's bio step and Paramètres' "Détails du
// profil" (bio/qualités/défauts/dealbreakers) — see lib/yeoyo/content.ts
// for the suggestion lists themselves.
export function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="max-w-full truncate rounded-full border border-border bg-background px-3 py-1.5 font-body text-xs text-muted-foreground"
          title={s}
        >
          {s.length > 42 ? `${s.slice(0, 42)}…` : s}
        </button>
      ))}
    </div>
  );
}
