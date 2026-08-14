'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface CustomSelectOption {
  value: string;
  label: string;
}

const ITEM_HEIGHT_PX = 44;
const DEFAULT_MAX_VISIBLE = 5;

// Compact, fully custom dropdown — replaces native `<select>` wherever the
// OS-rendered picker either can't be restyled (mobile browsers render their
// own full-screen wheel/sheet for `<select>`, ignoring all CSS) or ends up
// showing far more rows than fit comfortably on screen (e.g. 24 communes,
// 90 birth years). The popover caps its height to `maxVisible` rows and
// scrolls for the rest, with an optional search box for longer lists —
// mirrors this project's compact-dropdown reference pattern (colored
// border on the trigger, rounded panel, checkmark on the active row).
export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Choisir',
  ariaLabel,
  maxVisible = DEFAULT_MAX_VISIBLE,
  searchable = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  maxVisible?: number;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    if (searchable) searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, searchable]);

  function pick(opt: CustomSelectOption) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border-2 bg-surface px-4 py-3 text-left font-body text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
          open ? 'border-primary' : 'border-border hover:border-primary/40'
        } ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={`flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-fade-in-down absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border-2 border-primary/30 bg-surface shadow-lg"
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Icon name="search" size={14} className="flex-shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          )}
          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: `${ITEM_HEIGHT_PX * maxVisible}px` }}
          >
            {filtered.length === 0 && (
              <p className="px-4 py-3 font-body text-sm text-muted-foreground">Aucun résultat</p>
            )}
            {filtered.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(opt)}
                  style={{ height: `${ITEM_HEIGHT_PX}px` }}
                  className={`flex w-full items-center justify-between px-4 text-left font-body text-sm transition-colors ${
                    active
                      ? 'bg-secondary/40 font-semibold text-primary'
                      : 'text-foreground hover:bg-secondary/20'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <Icon name="check" size={15} className="flex-shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
