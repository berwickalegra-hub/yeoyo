'use client';

import { useState } from 'react';
import { CustomSelect } from '@/components/ui/CustomSelect';

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const MAX_AGE = 97;
const MIN_AGE = 18;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseIso(value: string): {
  day: number | null;
  month: number | null;
  year: number | null;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m || !m[1] || !m[2] || !m[3]) return { day: null, month: null, year: null };
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function toIso(day: number, month: number, year: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Explicit jour/mois/année selects, French month names — the app is
// francophone/Lingala-speaking (Kinshasa only), and a native
// `<input type="date">` renders in whatever order+language the visitor's OS
// locale dictates (often MM/DD in an English-locale phone), which reads
// wrong here. Three selects guarantee both the order and the vocabulary
// regardless of device. Matches the original Banani 3-dropdown DOB picker
// (see .planning/banani/STATUS.md Phase B — previously swapped for a native
// input, reverted per explicit user request 2026-08-13).
//
// Uses CustomSelect (not a native `<select>`) — mobile browsers render their
// own full-screen native picker for `<select>` that can't be restyled or
// capped in height, which is exactly the "fenêtre trop grande" complaint
// this replaces. CustomSelect caps the popover to 5 visible rows.
export function DateOfBirthFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const initial = parseIso(value);
  const [day, setDay] = useState<number | null>(initial.day);
  const [month, setMonth] = useState<number | null>(initial.month);
  const [year, setYear] = useState<number | null>(initial.year);

  function commit(next: { day: number | null; month: number | null; year: number | null }) {
    if (next.day != null && next.month != null && next.year != null) {
      const clampedDay = Math.min(next.day, daysInMonth(next.year, next.month));
      onChange(toIso(clampedDay, next.month, next.year));
    } else {
      onChange('');
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => currentYear - MIN_AGE - i);
  const dayCount = month != null && year != null ? daysInMonth(year, month) : 31;
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);

  const dayOptions = days.map((d) => ({ value: String(d), label: String(d) }));
  const monthOptions = MONTHS.map((label, i) => ({ value: String(i), label }));
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="grid grid-cols-3 gap-2">
      <CustomSelect
        ariaLabel="Jour de naissance"
        placeholder="Jour"
        value={day != null ? String(day) : ''}
        options={dayOptions}
        onChange={(v) => {
          const d = v ? Number(v) : null;
          setDay(d);
          commit({ day: d, month, year });
        }}
      />
      <CustomSelect
        ariaLabel="Mois de naissance"
        placeholder="Mois"
        value={month != null ? String(month) : ''}
        options={monthOptions}
        onChange={(v) => {
          const m = v ? Number(v) : null;
          setMonth(m);
          commit({ day, month: m, year });
        }}
      />
      <CustomSelect
        ariaLabel="Année de naissance"
        placeholder="Année"
        value={year != null ? String(year) : ''}
        options={yearOptions}
        searchable
        onChange={(v) => {
          const y = v ? Number(v) : null;
          setYear(y);
          commit({ day, month, year: y });
        }}
      />
    </div>
  );
}
