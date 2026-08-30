// Découvrir dashboard — "Pensée du jour" and "Conseil du jour" content.
//
// The quotes are real, public-domain scripture (Louis Segond 1910 for the
// Bible references, well-known Quran/Hadith translations for the Muslim
// set) — picked to match this app's actual religion options
// (CHRETIEN/CATHOLIQUE/PROTESTANT share one Christian set; MUSULMAN gets
// its own; profiles with no religion set — or not yet onboarded — get a
// small set of Congolese/African proverbs about marriage instead). Nothing
// here is generated or invented; every entry is a real, checkable source.
// Deterministic period-of-time rotation (not random) so the "quote of the
// day" is stable for everyone across a whole period (e.g. every 12h), and
// the whole set cycles evenly rather than repeating streaks or reshuffling
// on every page load/reload within the same period.
//
// The tips are generic, evergreen profile advice — deliberately phrased
// without invented statistics ("gets 3x more replies") since this kit
// tracks no such metric; see the Profile-completeness widget in
// decouvrir/page.tsx for the one stat that IS real.

export function periodicPick<T>(
  list: readonly T[],
  periodHours: number,
  date: Date = new Date(),
): T {
  const periodMs = periodHours * 60 * 60 * 1000;
  const bucket = Math.floor(date.getTime() / periodMs);
  const item = list[bucket % list.length];
  if (item === undefined) throw new Error('periodicPick: empty list');
  return item;
}

export interface Quote {
  text: string;
  reference: string;
}

const CHRISTIAN_QUOTES: Quote[] = [
  {
    text: "C'est pourquoi l'homme quittera son père et sa mère, et s'attachera à sa femme, et ils deviendront une seule chair.",
    reference: 'Genèse 2:24',
  },
  {
    text: "L'amour est patient, il est plein de bonté ; l'amour n'est point envieux ; l'amour ne se vante point, il ne s'enfle point d'orgueil.",
    reference: '1 Corinthiens 13:4',
  },
  {
    text: "Maris, aimez vos femmes, comme Christ a aimé l'Église, et s'est livré lui-même pour elle.",
    reference: 'Éphésiens 5:25',
  },
  {
    text: "Celui qui trouve une femme trouve le bonheur ; c'est une grâce qu'il obtient de l'Éternel.",
    reference: 'Proverbes 18:22',
  },
  {
    text: "Deux valent mieux qu'un, car ils retirent un bon salaire de leur travail. Car, s'ils tombent, l'un relève son compagnon.",
    reference: 'Ecclésiaste 4:9-10',
  },
  {
    text: "Où tu iras j'irai, où tu demeureras je demeurerai ; ton peuple sera mon peuple, et ton Dieu sera mon Dieu.",
    reference: 'Ruth 1:16',
  },
  {
    text: "Les grandes eaux ne peuvent éteindre l'amour, et les fleuves ne le submergeraient pas.",
    reference: 'Cantique des Cantiques 8:7',
  },
];

const MUSLIM_QUOTES: Quote[] = [
  {
    text: 'Lorsque le serviteur se marie, il a certes complété la moitié de sa religion.',
    reference: 'Hadith rapporté par Al-Bayhaqi',
  },
  {
    text: "Et parmi Ses signes, Il a créé pour vous, de vous-même, des épouses pour que vous viviez en tranquillité avec elles ; et Il a mis entre vous de l'affection et de la bonté.",
    reference: 'Sourate Ar-Rum (30:21)',
  },
  {
    text: "Et vis avec elles suivant la bienséance. Si tu as de l'aversion envers elles, il se peut que tu aies de l'aversion pour une chose où Allah a mis un grand bien.",
    reference: 'Sourate An-Nisa (4:19)',
  },
  {
    text: "Les meilleurs d'entre vous sont ceux qui sont les meilleurs envers leurs épouses.",
    reference: 'Hadith rapporté par At-Tirmidhi',
  },
  {
    text: 'Elles sont un vêtement pour vous et vous êtes un vêtement pour elles.',
    reference: 'Sourate Al-Baqarah (2:187)',
  },
];

const GENERAL_QUOTES: Quote[] = [
  {
    text: 'Un seul doigt ne peut pas laver le visage — le mariage se construit à deux.',
    reference: 'Proverbe africain',
  },
  {
    text: "Ce n'est pas parce qu'on se ressemble qu'on s'entend, c'est parce qu'on s'entend qu'on se ressemble.",
    reference: 'Proverbe africain',
  },
  {
    text: 'Avant de construire la maison, on choisit bien le terrain.',
    reference: 'Proverbe africain',
  },
  { text: 'La patience est la clé qui ouvre toutes les portes.', reference: 'Proverbe africain' },
  {
    text: "Deux cœurs qui s'accordent font une maison qui tient debout.",
    reference: 'Proverbe africain',
  },
];

export function quotesForReligion(religion: string | null): Quote[] {
  if (religion === 'CHRETIEN' || religion === 'CATHOLIQUE' || religion === 'PROTESTANT') {
    return CHRISTIAN_QUOTES;
  }
  if (religion === 'MUSULMAN') return MUSLIM_QUOTES;
  return GENERAL_QUOTES;
}

export const PROFILE_TIPS: string[] = [
  "Ajoute une photo récente et claire — c'est la première chose qu'on regarde.",
  'Complète ta bio "Ta vision du mariage" pour montrer ton sérieux.',
  'Précise ta commune pour rencontrer des profils proches de chez toi.',
  'Réponds aux nouvelles demandes de contact rapidement, ça montre ton intérêt.',
  'Un profil vérifié inspire davantage confiance — termine ta vérification dans Paramètres.',
  'Indique clairement ton intention (court, moyen ou long terme) pour éviter les malentendus.',
  'Reste toi-même dans ta bio — la sincérité se remarque.',
  'Complète ta situation familiale (statut marital, enfants) pour des rencontres plus adaptées.',
];

// Tap-to-fill suggestions for the free-text profile fields — for the
// person who "ne veut pas écrire" (doesn't want to type): tap a chip,
// it fills the field, still editable afterward. Plain canned phrasing,
// not a claim about any real user — safe to ship as suggestions.
export const BIO_SUGGESTIONS: string[] = [
  "Pour moi, le mariage c'est un engagement sincère basé sur le respect et la foi.",
  'Je recherche une relation sérieuse qui mène au mariage, fondée sur la confiance.',
  "Je crois en un mariage où l'on se soutient mutuellement dans les bons et les mauvais moments.",
  "Je suis prêt(e) à construire une famille avec quelqu'un de sincère et de respectueux.",
];

export const QUALITIES_SUGGESTIONS: string[] = [
  'Déterminé(e) et organisé(e), je reste patient(e) et à l’écoute au quotidien.',
  "Généreux(se) et optimiste, j'aime prendre soin des personnes qui comptent pour moi.",
  'Calme et réfléchi(e), je privilégie le dialogue en toute situation.',
  "Travailleur(se) et loyal(e), je m'investis pleinement dans ce qui compte pour moi.",
];

export const FLAWS_SUGGESTIONS: string[] = [
  'Je peux être un peu réservé(e) au début, mais je m’ouvre vite en confiance.',
  'Perfectionniste, je suis parfois exigeant(e) envers moi-même.',
  'Impatient(e) sur certains sujets, mais je travaille dessus.',
  "Je peux avoir du mal à déléguer, j'aime que les choses soient bien faites.",
];

export const DEALBREAKERS_SUGGESTIONS: string[] = [
  "Je ne peux pas envisager une relation où règnent le mensonge ou l'infidélité.",
  'Le manque de respect envers ma famille est inacceptable pour moi.',
  'La violence, sous toutes ses formes, est une limite absolue.',
  "Je n'accepte pas le manque de sérieux ou d'engagement dans une relation.",
];
