'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        minLength={minLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-4 py-3 pr-11 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={17} />
      </button>
    </div>
  );
}
