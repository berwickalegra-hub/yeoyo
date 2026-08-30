import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YeOyo — Rencontres sérieuses en Afrique francophone',
    short_name: 'YeOyo',
    description:
      'La rencontre sérieuse, faite pour l’Afrique francophone. Profils vérifiés par IA.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'fr',
    background_color: '#fdfbf8',
    theme_color: '#c17a4e',
    categories: ['social', 'lifestyle'],
    icons: [
      { src: '/pwa/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
