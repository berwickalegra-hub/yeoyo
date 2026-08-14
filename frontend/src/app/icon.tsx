import { ImageResponse } from 'next/og';
import { brandIconElement } from '@/lib/yeoyo/pwa-icon';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(brandIconElement(32), size);
}
