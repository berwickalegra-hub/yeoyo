import path from 'node:path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not proxy.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
const isDev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy — shipped in *Report-Only* mode first.
//
// Report-Only means the browser NEVER blocks anything: it only posts a console
// warning (and a report, if report-uri is set) when a resource would have been
// refused. That lets us watch real traffic for a few days, confirm nothing
// legitimate trips it, then promote this to the enforcing `Content-Security-Policy`
// header by renaming the key below — a one-line change.
//
// No nonce: a nonce-based strict CSP forces every page into dynamic rendering
// (no static optimization, no CDN caching, higher cost) which is a bad trade for
// this app right now. `'unsafe-inline'` on script/style is the price of keeping
// static rendering; the policy still blocks injected <script src=…> from foreign
// origins, inline event handlers via strict-dynamic-free script-src, plugins
// (object-src 'none'), <base> hijacking, and cross-origin form posts.
const csp = [
  "default-src 'self'",
  // challenges.cloudflare.com = Cloudflare Turnstile widget script + iframe.
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com https://storage.googleapis.com https://images.pexels.com",
  "font-src 'self' data:",
  // Cloudinary (direct upload), Ably (realtime + REST + fallback hosts), Sentry ingest.
  `connect-src 'self' https://api.cloudinary.com https://*.ably.io https://*.ably-realtime.com wss://*.ably.io wss://*.ably-realtime.com https://*.sentry.io${
    isDev ? ' ws://localhost:* http://localhost:*' : ''
  }`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' https://res.cloudinary.com",
  "frame-src 'self' https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy-Report-Only', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

// pnpm hoists/symlinks packages (next, react, ...) into the *workspace
// root's* node_modules/.pnpm store, not into frontend/node_modules directly.
// Turbopack's root confinement ("files outside of the project directory will
// not be compiled") was previously pointed at `frontend/` (__dirname) itself,
// which put the real, symlink-resolved location of the `next` package
// outside the trusted boundary and produced: "couldn't find the Next.js
// package (next/package.json) from the project directory: .../frontend/src/app".
// Pointing root one level up, at the pnpm workspace root, is Next's own
// documented fix for this exact monorepo layout.
const workspaceRoot = path.join(__dirname, '..');

// Vercel sets VERCEL=1 during its own build. Vercel's builder auto-detects
// the pnpm workspace root from the lockfile and does its own serverless
// function file-tracing — it does NOT consume `output: 'standalone'`.
// Combining `output: 'standalone'` with `outputFileTracingRoot` pointed
// outside the Vercel Root Directory ("frontend") shifts where Next writes
// `next-server.js.nft.json`, and Vercel's own onBuildComplete step then
// fails: "ENOENT ... open '/vercel/path0/frontend/.next/next-server.js.nft.json'".
// `output: 'standalone'` is only needed for the self-hosted Docker image
// (frontend/Dockerfile); `outputFileTracingRoot` is only needed for that
// same standalone/Docker build to bundle the correct pnpm-hoisted
// node_modules. Skip both on Vercel so its own packaging owns the tracing.
const isVercelBuild = !!process.env.VERCEL;

const config: NextConfig = {
  reactStrictMode: true,
  ...(isVercelBuild ? {} : { outputFileTracingRoot: workspaceRoot }),
  turbopack: {
    root: workspaceRoot,
  },
  // The floating black "N" badge some testers spot in a corner during
  // `pnpm dev` is Next.js's own dev-mode indicator — not app UI, and never
  // present in a production build. Disabled here so dev screenshots match
  // what a real visitor sees.
  devIndicators: false,
  // Dev-only, never shipped to prod: `next dev`'s HMR websocket + asset
  // requests are same-origin-locked by default (DNS-rebinding protection),
  // which silently breaks the whole page (repeated failed reconnects → a
  // reload loop) the moment you view it through a tunnel like ngrok instead
  // of localhost. Wildcarding the common ngrok domain suffixes here means
  // this keeps working across tunnel restarts without hardcoding today's
  // random subdomain into a committed file.
  ...(process.env.NODE_ENV !== 'production'
    ? { allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io', '*.ngrok.app'] }
    : {}),
  // Standalone output bundles a self-contained server.js + minimal node_modules
  // into .next/standalone — required by the Docker runtime image (frontend/Dockerfile).
  // Has no impact on `next dev` / `next start` workflows. Not set on Vercel
  // (see isVercelBuild comment above).
  ...(isVercelBuild ? {} : { output: 'standalone' as const }),
  images: {
    remotePatterns: [
      // Cloudinary-hosted profile photos/avatars (frontend/src/lib/server/upload).
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      // Google account avatar (oauth/google.ts stores the `picture` claim
      // as-is). Google serves these from lh3/lh4/lh5/lh6 subdomains.
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      // Illustrative fixture photos only (scripts/seed-yeoyo-profiles.ts) —
      // real avatars from this project's own Banani design export (public
      // GCS bucket). Not used by any real upload path.
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/banani-avatars/**',
      },
      // Landing-page hero photo — Banani's own AI-generated image pipeline
      // (`<Image prompt="…">` in the Banani source), not a real person's
      // photo, resolved to its stable GCS URL rather than the redirecting
      // app.banani.co endpoint.
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/banani-generated-images/**',
      },
      // Illustrative fixture photos only (scripts/seed-yeoyo-more.ts) —
      // licensed stock photos, not scraped real-people photos. Not used by
      // any real upload path.
      { protocol: 'https', hostname: 'images.pexels.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel client requests through a Next.js route to bypass ad-blockers
  // that filter direct Sentry calls. Off by default — turn on if your
  // user base has heavy ad-blocker usage.
  // tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
});
