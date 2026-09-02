// Shared JSX for every generated PWA/favicon asset (icon.tsx, apple-icon.tsx,
// app/pwa/icon/[size]/route.tsx). Rendered through Satori (`next/og`'s
// ImageResponse), which only understands inline flexbox styles — it isn't a
// browser, so the project's "no inline styles" rule doesn't apply here; this
// is the only supported way to draw these images. The mark itself mirrors
// public/yeoyo-icon.svg (two overlapping circles + rose lens) — Satori
// supports a subset of raw SVG elements (svg/circle/path) as JSX children.
export function brandIconElement(px: number) {
  const markWidth = px * 0.74;
  const markHeight = (markWidth * 100) / 148;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff6f8',
        borderRadius: px * 0.22,
      }}
    >
      <svg width={markWidth} height={markHeight} viewBox="0 0 148 100" fill="none">
        <circle cx="47" cy="50" r="40" fill="#1F3A2E" />
        <circle cx="101" cy="50" r="40" fill="#1F3A2E" />
        <path d="M74 20.49 A40 40 0 0 1 74 79.51 A40 40 0 0 1 74 20.49" fill="#D63C6D" />
      </svg>
    </div>
  );
}
