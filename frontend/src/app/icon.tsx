import { ImageResponse } from 'next/og';
import { brandIconElement } from '@/lib/yeoyo/pwa-icon';

// 48px, not 32 — Google recommends a favicon whose size is a multiple of
// 48px for Search results (it downscales as needed); 32 sometimes gets
// skipped. The .ico sibling (app/favicon.ico, 16/32/48) covers the classic
// /favicon.ico probe that Googlebot and other crawlers hit first.
export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(brandIconElement(48), size);
}
