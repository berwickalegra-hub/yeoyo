import { ImageResponse } from 'next/og';
import { brandIconElement } from '@/lib/yeoyo/pwa-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(brandIconElement(180), size);
}
