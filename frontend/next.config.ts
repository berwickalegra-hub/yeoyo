import path from 'node:path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not middleware.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
//
// CSP is intentionally NOT included here. App Router pages need a per-request
// nonce (server-rendered) for inline scripts; ship CSP via middleware.ts when
// the first frontend page lands. For now, the API-only surface doesn't render
// HTML and doesn't need CSP.
const securityHeaders = [
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

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  // The floating black "N" badge some testers spot in a corner during
  // `pnpm dev` is Next.js's own dev-mode indicator — not app UI, and never
  // present in a production build. Disabled here so dev screenshots match
  // what a real visitor sees.
  devIndicators: false,
  // Standalone output bundles a self-contained server.js + minimal node_modules
  // into .next/standalone — required by the Docker runtime image (frontend/Dockerfile).
  // Has no impact on `next dev` / `next start` workflows.
  output: 'standalone',
  images: {
    remotePatterns: [
      // Cloudinary-hosted profile photos/avatars (frontend/src/lib/server/upload).
      { protocol: 'https', hostname: 'res.cloudinary.com' },
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
      // Illustrative fixture photos only (scripts/seed-yeoyo-women.ts) —
      // randomuser.me portraits, chosen deliberately over scraping arbitrary
      // photos of real people off Google Images (would put a real person's
      // face on a fake dating profile without consent). Not used by any
      // real upload path.
      { protocol: 'https', hostname: 'randomuser.me' },
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
