// Shared option lists — extracted so onboarding and Paramètres' "Préférences
// de recherche" section (which edits the same commune/intent fields) don't
// each hardcode their own copy.
export const KINSHASA_COMMUNES = [
  'Bandalungwa',
  'Barumbu',
  'Bumbu',
  'Gombe',
  'Kalamu',
  'Kasa-Vubu',
  'Kimbanseke',
  'Kinshasa',
  'Kintambo',
  'Kisenso',
  'Lemba',
  'Limete',
  'Lingwala',
  'Makala',
  'Maluku',
  'Masina',
  'Matete',
  'Mont-Ngafula',
  'Ndjili',
  'Ngaba',
  'Ngaliema',
  'Ngiri-Ngiri',
  'Nsele',
  'Selembao',
];

// The 6 countries YeOyo's payment integration actually supports (Chariow
// checkout + phone parsing, see lib/server/payments/chariow.ts). This ISO2
// list is the single source of truth for country selection anywhere in the
// app — the onboarding country step, the credits shop's phone-country
// picker, and the profile.country Zod validation (api/profile/route.ts) all
// derive from it, so those lists can never drift apart.
export const COUNTRY_CODES = ['CD', 'SN', 'CI', 'BJ', 'TG', 'CM'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

const COUNTRY_LABELS: Record<CountryCode, string> = {
  CD: 'RD Congo',
  SN: 'Sénégal',
  CI: "Côte d'Ivoire",
  BJ: 'Bénin',
  TG: 'Togo',
  CM: 'Cameroun',
};

const COUNTRY_DIAL_LABELS: Record<CountryCode, string> = {
  CD: 'RD Congo (+243)',
  SN: 'Sénégal (+221)',
  CI: "Côte d'Ivoire (+225)",
  BJ: 'Bénin (+229)',
  TG: 'Togo (+228)',
  CM: 'Cameroun (+237)',
};

export const COUNTRIES = COUNTRY_CODES.map((value) => ({ value, label: COUNTRY_LABELS[value] }));

// Same list, with each country's dial code — the exact shape the credits
// shop's phone-country <select> needs (`"Name (+dial)"` labels).
export const PHONE_COUNTRIES = COUNTRY_CODES.map((value) => ({
  value,
  label: COUNTRY_DIAL_LABELS[value],
}));

// Basic autocomplete suggestions for the onboarding city field — a short,
// hand-picked list of major cities per supported country, NOT a geographic
// database. The field stays free text; this only populates the browser's
// native <datalist> so typing "Lub" can suggest "Lubumbashi" without any
// geocoding dependency.
export const MAJOR_CITIES_BY_COUNTRY: Record<CountryCode, string[]> = {
  CD: ['Kinshasa', 'Lubumbashi', 'Goma', 'Bukavu', 'Kisangani', 'Kananga', 'Mbuji-Mayi', 'Matadi'],
  SN: ['Dakar', 'Thiès', 'Touba', 'Rufisque', 'Saint-Louis', 'Ziguinchor', 'Kaolack'],
  CI: ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro', 'Korhogo', 'Daloa'],
  BJ: ['Cotonou', 'Porto-Novo', 'Parakou', 'Abomey-Calavi', 'Djougou'],
  TG: ['Lomé', 'Sokodé', 'Kara', 'Kpalimé', 'Atakpamé'],
  CM: ['Douala', 'Yaoundé', 'Garoua', 'Bamenda', 'Bafoussam', 'Maroua'],
};

export const INTENT_OPTIONS = [
  { value: 'COURT_TERME', label: 'Mariage à court terme' },
  { value: 'MOYEN_TERME', label: 'Mariage à moyen terme' },
  { value: 'LONG_TERME', label: 'Mariage à long terme' },
];

// Shared between the Messages thread header and the profile-detail screen —
// both expose "Signaler" against the same POST /api/reports.
export const REPORT_REASONS = [
  { value: 'FAKE_PROFILE', label: 'Faux profil' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Contenu inapproprié' },
  { value: 'HARASSMENT', label: 'Harcèlement' },
  { value: 'SCAM', label: 'Arnaque' },
  { value: 'OTHER', label: 'Autre' },
] as const;
