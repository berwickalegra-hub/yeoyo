// Generates the 192/512px PNG icons `manifest.ts` references for Android/
// Chrome installability (the icon.tsx/apple-icon.tsx conventions only cover
// the browser favicon + iOS home-screen icon, not the manifest's own icon
// list). No external image asset needed — same brand mark as icon.tsx.
export const runtime = 'nodejs';

import { ImageResponse } from 'next/og';
import { brandIconElement } from '@/lib/yeoyo/pwa-icon';

const ALLOWED_SIZES = new Set([192, 512]);

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await ctx.params;
  const px = Number(sizeParam);
  const size = ALLOWED_SIZES.has(px) ? px : 512;

  return new ImageResponse(brandIconElement(size), { width: size, height: size });
}
