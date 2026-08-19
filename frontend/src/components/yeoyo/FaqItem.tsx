'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

// Landing page FAQ accordion (2026-08-19) — replaces the old dead "FAQ" nav
// label with a real section. One item open at a time isn't enforced here
// (each <FaqItem> owns its own state) since a landing FAQ is short enough
// that letting several stay open at once doesn't hurt scannability.
export function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-headings text-sm font-bold text-foreground lg:text-base">
          {question}
        </span>
        <Icon
          name="chevron-down"
          size={18}
          className={`flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="animate-fade-in-up px-5 pb-4 font-body text-sm leading-relaxed text-muted-foreground">
          {answer}
        </p>
      )}
    </div>
  );
}
