// Shared JSX for every generated PWA/favicon asset (icon.tsx, apple-icon.tsx,
// app/pwa/icon/[size]/route.tsx). Rendered through Satori (`next/og`'s
// ImageResponse), which only understands inline flexbox styles — it isn't a
// browser, so the project's "no inline styles" rule doesn't apply here; this
// is the only supported way to draw these images.
export function brandIconElement(px: number) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #c17a4e 0%, #8a4a28 100%)',
        borderRadius: px * 0.22,
      }}
    >
      <span
        style={{
          fontFamily: 'sans-serif',
          fontWeight: 700,
          fontSize: px * 0.55,
          color: '#ffffff',
        }}
      >
        Y
      </span>
    </div>
  );
}
